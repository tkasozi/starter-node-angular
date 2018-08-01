//Talik Kasozi
//Automation deployment 

let cmd = require('node-cmd');
let path, node_ssh, ssh, fs, config, project, host_, hs_key;

config = require('./config')
host_ = config.host,
hs_key = config.hs_key;
fs = require('fs');
path = require('path');
project = path.basename(config.project)

node_ssh = require('node-ssh');
ssh = new node_ssh();

// the method that starts the deployment process
function main() {
  console.log('Deployment started.');
  sshConnect();
}

// installs PM2
function installPM2() {
  return ssh.execCommand(
    'sudo npm install pm2 -g', {
      cwd: '/home/ubuntu'
  });
}

// transfers local project to the remote server
function transferProjectToRemote(failed, successful) {
  return ssh.putDirectory(
    `../${project}`,
    `/home/ubuntu/${project}`,
    {
      recursive: true,
      concurrency: 1,
      validate: function(itemPath) {
        const baseName = path.basename(itemPath);
        return (
          baseName.substr(0, 1) !== '.' && baseName !== 'node_modules' // do not allow dot files
        ); // do not allow node_modules
      },
      tick: function(localPath, remotePath, error) {
        if (error) {
          failed.push(localPath);
          console.log('failed.push: ' + localPath);
        } else {
          successful.push(localPath);
          console.log('successful.push: ' + localPath);
        }
      }
    }
  );
}

// creates a temporary folder on the remote server
function createRemoteTempFolder() {
  return ssh.execCommand(
    `ls`, {
      cwd: '/home/ubuntu'
  });
}

// stops mongodb and node services on the remote server
function stopRemoteServices() {
  return ssh.execCommand(
    'pm2 stop all && sudo service mongod stop', {
      cwd: '/home/ubuntu'
  });
}

// restart mongodb and node services on the remote server
//2
function restartRemoteServices() {
  return ssh.execCommand(
    `cd  ${project} && sudo service mongod start && pm2 start app.js \
    && chmod +x  npmInstall.sh  && ./npmInstall.sh`, {
      cwd: '/home/ubuntu' 
  });
}
// connect to the remote server
function sshConnect() {
  console.log('Connecting to the server...');

  ssh
    .connect({
      // TODO: ADD YOUR IP ADDRESS BELOW (e.g. '12.34.5.67')
      host: host_,
      username: 'ubuntu',
      privateKey: hs_key
    })
    .then(function() {
      console.log('SSH Connection established.');
      console.log('Installing PM2...');
      return installPM2();
    })
    .then(function() {
      return createRemoteTempFolder();
    })
    .then(function(result) {
      const failed = [];
      const successful = [];
      if (result.stdout) {
        console.log('STDOUT: ' + result.stdout);
      }
      if (result.stderr) {
        console.log('STDERR: ' + result.stderr);
        return Promise.reject(result.stderr);
      }
      console.log('Transferring files to remote server...');
      return transferProjectToRemote(failed, successful);
    })
    .then(function(status) {
      if (status) {
        console.log('Stopping remote services.');
        return stopRemoteServices();
      } else {
        return Promise.reject(failed.join(', '));
      }
    })
    .then(function(status) {
      if (status) {
        console.log('Restarting remote services...');
        return restartRemoteServices();
      } else {
        return Promise.reject(failed.join(', '));
      }
    })
    .then(function() {
      console.log("DEPLOYMENT COMPLETE!");
      process.exit(0); 
    })
    .catch(e => {
      console.error(e);
      process.exit(0);
    });
}

main();
