var node = require('nodester-api').nodester,
  config = require('./config'),
  sys = require('sys'),
  path = require('path'),
  log = require('./log'),
  fs = require('fs'),
  tty, iniparser = require('iniparser');

try {
  tty = require('tty');
} catch (e) {}


var info = {
  email: '',
  coupon: '',
  username: '',
  sshkey: ''
};

module.exports = {
  usage: function () {
    log.usage('user register <coupon-code> - Register a user');
    log.usage('user setup <username> - Setup this user');
    log.usage('user setpass sendtoken - Sends password reset token to user email');
    log.usage('user setpass <token> - Set a new password for this user');
    log.usage('user setkey </path/to/sshkey> - Set an sshkey (if no argument, ~/.ssh/id_rsa.pub is used)');
    log.usage('user create <username> <email address> <file containing ssh public key> <coupon code> - Create a user');
  },
  create: function (args) {
    if (args.length < 5) {
      log.usage('user create <username> <email address> <file containing ssh public key> <coupon code> - Create a user');
      log.error('All arguments are required');
    }

    var user = args[0];
    var email = args[1];
    var rsakey = args[2];
    var coupon = args[3];

    askPass(fucntion(pass) {
      log.info('creating user:', user, ' <' + email + '>');
      var nodeapi = new node("", "", config.apihost, config.apisecure);
      args.push(function (err, data, original) {
        if (err) {
          log.info(original);
          log.error(err.message);
        }
        log.info('user successfully created');
        config.writeUser(user, pass);
      });
      nodeapi.user_create.apply(nodeapi, args);
    });
  },
  setkey: function (args) {
    config.check();
    var key = args[0];
    if (!key) {
      key = path.join(process.env.HOME, '.ssh', 'id_rsa.pub');
    }
    if (!path.existsSync(key)) {
      log.error('sshkey was not found:', key);
    }
    var rsadata = fs.readFileSync(key).toString();
    if (rsadata.length < 40) {
      log.error("Invalid SSH key file.");
    }
    log.info('sending sshkey:', key);
    var nodeapi = new node(config.username, config.password, config.apihost, config.apisecure);
    nodeapi.user_setkey(rsadata, function (err, data, original) {
      if (err) {
        log.info(original);
        log.error(err.message);
      }
      log.info('ssh key successfully sent');
    });
  },
  setpass: function (args) {
    config.check();
    var nodeapi = new node(config.username, config.password, config.apihost, config.apisecure);
    if (args.length == 1 && args[0] == 'sendtoken') {
      nodeapi.user_sendtoken(config.username, function (err, data, original) {
        if (err && !data) {
          log.info(original);
          log.error(err.message);
        } else {
          log.info(data.status);
          log.info('token for setpass has been sent to your email!');
        }
      });
    } else if (args.length == 1 && args[0] != 'sendtoken') {
      askPass(function(password) {
        nodeapi.user_setpass(args[0], password, function (err, data, original) {
          if (err) {
            log.info(original);
            log.error(err.message);
          }
          log.info('password successfully changed.');
          config.writeUser(config.username, args[0]);
        });
      });
    } else {
      log.error('Argument missing: ', 'setpass sendtoken or setpass <token> <new_password>');
    }
  },
  setup: function (args) {
    if (args.length < 1) {
      log.error('Argument missing: ', '<username>');
    }

    askPass(function(password) {
      var nodeapi = new node(args[0], password, config.apihost, config.apisecure);
      log.info('verifying credentials');
      nodeapi.apps_list(function (err, data, original) {
        if (err) {
          log.info(original);
          log.error(err.message);
        }
        log.info('user verified..');
        config.writeUser(args[0], args[1]);
      });
    });
  },
  register: function (args) {
    if (!args.length) {
      log.error('Coupon Code Required');
    }
    if (args[1] && args[1].indexOf('@') > -1) {
      info.email = args[1];
    }
    if (!info.email && path.existsSync(path.join(process.env.HOME, '.gitconfig'))) {
      var git = iniparser.parseSync(path.join(process.env.HOME, '.gitconfig'));
      info.email = git.user.email;
    } else if (!info.email) {
      log.error('Could not find an email address as an argument or from your ~/.gitconfig, please pass one as an additional argument');
    }
    info.coupon = args[0];
    info.username = process.env.USER;

    if(info.username == '') {
      
    }


    var sshkey = path.join(process.env.HOME, '.ssh', 'id_rsa.pub')
    if (path.existsSync(sshkey)) {
      info.sshkey = sshkey;
    } else {
      log.error('Could not auto find your ssh key: ', sshkey, 'use <' + config.brand + ' user create> instead');
    }
    log.info('Registering with the following information:');
    for (var i in info) {
      log.info(i + ':', info[i]);
    }
    log.warn('Does this information look correct? [y/N]');
    log.info('(If it does not, hit Ctrl+C and use <' + config.brand + ' user create> instead)');
    var stdin = process.openStdin();
    stdin.setEncoding('utf8');
    stdin.addListener('data', function (data) {
      stdin.removeAllListeners('data');
      data = data.replace('\n', '').toLowerCase().substring(0, 1);
      if (data === 'y') {
        askPass(function (password) {
          info.password = password;
          log.info('creating user:', info.username, ' <' + info.email + '>');
          var nodeapi = new node("", "", config.apihost, config.apisecure);
          nodeapi.user_create(info.username, info.password, info.email, info.sshkey, info.coupon, function (err, data, original) {
            if (err) {
              log.info(original);
              log.error(err.message);
            }
            log.info('user created..');
            config.writeUser(info.username, info.password);
          });
        });
      } else {
        log.error('aborting registration');
        stdin.pause();
      }
    });

  }
}

var askPass = exports.askPass = function (fn) {
    var stdin = process.openStdin();
    stdin.setEncoding('utf8');
    var p = [],
      c = '';
    console.log('Please enter your password:');
    if (!tty) {
      log.warn('Node version (' + process.version + ') has no tty module, passwords will be echoed to stdout');
      stdin.addListener('data', function (data) {
        data += '';
        data = data.replace('\n', '');
        p.push(data);
        if (p.length === 2) {
          if (p[0] !== p[1]) {
            p = [];
            log.warn('Passwords did not match, please try again.');
            console.log('Please re-enter your password:');
          } else {
            stdin.removeAllListeners('data');
            stdin.pause();
            fn(p[0]);
          }
        } else {
          console.log('Confirm password:');
        }
      });
    } else {
      tty.setRawMode();
      stdin.addListener('data', function (data) {
        data += '';
        switch (data) {
        case '\u0003':
          log.error('exiting from Ctrl+C');
          process.exit()
          break
        case '\n':
        case '\r':
          p.push(c);
          c = '';
          if (p.length === 1) {
            console.log('\nConfirm password:');
          } else {
            if (p[0] === p[1]) {
              stdin.removeAllListeners('data');
              console.log('\n');
              tty.setRawMode(false);
              stdin.pause();
              fn(p[0]);
            } else {
              p = [];
              console.log('\n');
              log.warn('Passwords did not match, please try again.');
              console.log('Please re-enter your password:');
            }
          }
          break;
        default:
          process.stdout.write("*");
          c += data;
        }
      });
    }
  }
