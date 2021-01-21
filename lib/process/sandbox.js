'use strict';

//TODO remove for node >= 10
require('promise.prototype.finally').shim();
const { killAsync } = require('./utils');

module.exports = function(processFile, childPool) {
  return function process(job, setOnTimeout) {
    return childPool.retain(processFile, { noPull: this.noPull }).then(child => {
      let msgHandler;
      let exitHandler;

      child.send({
        cmd: 'start',
        job: job
      });

      const done = new Promise((resolve, reject) => {
        msgHandler = function(msg) {
          switch (msg.cmd) {
            case 'completed':
              resolve(msg.value);
              break;
            case 'failed':
            case 'error': {
              const err = new Error();
              Object.assign(err, msg.value);
              reject(err);
              break;
            }
            case 'progress':
              job.progress(msg.value);
              break;
            case 'update':
              job.update(msg.value);
              break;
            case 'log':
              job.log(msg.value);
              break;
          }
        };

        exitHandler = (exitCode, signal) => {
          reject(
            new Error(
              'Unexpected exit code: ' + exitCode + ' signal: ' + signal
            )
          );
        };

        job.killMe = () => {
          killAsync(child);
        };

        child.on('message', msgHandler);
        child.on('exit', exitHandler);
      });

      return done.finally(() => {
        child.removeListener('message', msgHandler);
        child.removeListener('exit', exitHandler);

        if (child.exitCode !== null || /SIG.*/.test(child.signalCode)) {
          childPool.remove(child);
        } else {
          if (this.killOnCompleted) childPool.kill(child);
          else childPool.release(child);
        }
      });
    });
  };
};
