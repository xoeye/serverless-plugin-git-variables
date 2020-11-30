'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// TODO: Consider using nodegit instead
const GIT_PREFIX = 'git';

async function _exec(cmd, options = { timeout: 1000 }) {
  return new _promise2.default((resolve, reject) => {
    _child_process2.default.exec(cmd, options, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

class ServerlessGitVariables {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.resolvedValues = {};
    const delegate = serverless.variables.getValueFromSource.bind(serverless.variables);

    serverless.variables.getValueFromSource = variableString => {
      if (variableString.startsWith(`${GIT_PREFIX}:`)) {
        const variable = variableString.split(`${GIT_PREFIX}:`)[1];
        return this._getValue(variable);
      }

      return delegate(variableString);
    };
    this.hooks = {
      'after:package:initialize': this.exportGitVariables.bind(this),
      'before:offline:start': this.exportGitVariables.bind(this),
      'before:offline:start:init': this.exportGitVariables.bind(this)
    };
  }

  async _getValue(variable) {
    if (this.resolvedValues[variable]) {
      return _promise2.default.resolve(this.resolvedValues[variable]);
    }

    return this._getValueFromGit(variable);
  }

  async _getValueFromGit(variable) {
    let value = null;
    switch (variable) {
      case 'describe':
        value = await _exec('git describe --always');
        break;
      case 'describeLight':
        value = await _exec('git describe --always --tags');
        break;
      case 'sha1':
        value = await _exec('git rev-parse --short HEAD');
        break;
      case 'commit':
        value = await _exec('git rev-parse HEAD');
        break;
      case 'branch':
        value = await _exec('git rev-parse --abbrev-ref HEAD');
        break;
      case 'message':
        value = await _exec('git log -1 --pretty=%B');
        break;
      case 'isDirty':
        value = (await _exec('git diff --stat')) !== '';
        break;
      case 'repository':
        const pathName = await _exec('git rev-parse --show-toplevel');
        value = _path2.default.basename(pathName);
        break;
      default:
        throw new Error(`Git variable ${variable} is unknown. Candidates are 'describe', 'describeLight', 'sha1', 'commit', 'branch', 'message', 'repository'`);
    }

    // TODO: Figure out why if I don't log, the deasync promise
    // never resolves. Catching it in the debugger or logging
    // causes it to work fine.
    process.stdout.write('');

    // Cache before returning
    this.resolvedValues[variable] = value;
    return value;
  }

  async exportGitVariables() {
    const exportGitVariables = this.serverless.service.custom && this.serverless.service.custom.exportGitVariables;
    if (exportGitVariables === false) {
      return;
    }

    const sha1 = await this._getValue('sha1');
    const commit = await this._getValue('commit');
    const branch = await this._getValue('branch');
    const isDirty = await this._getValue('isDirty');
    const repository = await this._getValue('repository');

    for (const functionName of this.serverless.service.getAllFunctions()) {
      const func = this.serverless.service.getFunction(functionName);

      this.exportGitVariable(func, 'GIT_COMMIT_SHORT', sha1);
      this.exportGitVariable(func, 'GIT_COMMIT_LONG', commit);
      this.exportGitVariable(func, 'GIT_BRANCH', branch);
      this.exportGitVariable(func, 'GIT_IS_DIRTY', isDirty);
      this.exportGitVariable(func, 'GIT_REPOSITORY', repository);
    }
  }

  exportGitVariable(func, variableName, gitValue) {
    if (!func.environment) {
      func.environment = {};
    }

    if (!func.environment[variableName]) {
      func.environment[variableName] = gitValue;
    }

    if (!func.tags) {
      func.tags = {};
    }

    if (!func.tags[variableName]) {
      func.tags[variableName] = gitValue;
    }
  }
}
exports.default = ServerlessGitVariables;
module.exports = exports['default'];