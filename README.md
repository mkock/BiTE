BiTE
====

## Introduction

This documentation is in three parts;

  * [Readme for the BITE Backend](/backend/README.md).
  * ~~Readme for the BITE Frontend.~~
  * ~~Readme for the BITE Admin.~~

## Getting Started for Production

Documentation will be added.

## Getting Started for Developers

Installation assumes a *_Debian-based_* Linux distribution such as Ubuntu 14.04, with [Vagrant](https://www.vagrantup.com/) and [Oracle VirtualBox](https://www.virtualbox.org/) pre-installed.

  1. Run `vagrant up` if using Vagrant, or run `Vagrantbootstrap.sh` as root to
   update the system, install MongoDB, nodejs and gulp etc.

  2. Run `npm install` to install all dependencies for the backend

  3. Go download and upzip the test database

  ```bash
  curl -O https://s3-eu-west-1.amazonaws.com/bem-test-s3-bucket/bitedb_test/20141212-bitedb.tar.gz
  tar -zvxf 20141212-bitedb.tar.gz
  rm 20141212-bitedb.tar.gz
  ```

  4. Run `mongod --dbpath 20141212-bitedb` to start MongoDB.

  5. Run `redis-server` to start Redis.

  6. Define the relevant environment variables by copying `config.sh.default` to `config.sh` and fill in the blanks, then run `source config.sh` to define them in your current shell.

  7. Start the nodejs app:

   ```bash
   cd backend
   gulp start
   ```

   *(just ignore the environment variable warnings)*

   8. Start interacting with the application. Assuming that the application is running on `localhost:5000`, you will then find;

   - The API running on `http://localhost:5000/v1/.../`
   - The API documentation running on `http://localhost:5000/documentation`
   - The admin panel running on `http://localhost:5000/admin`

You are now done setting up the backend and we can move forward to the frontend

  1. Start by going to the frontend directory `cd frontend`

  2. To install all the dependencies we run `npm install && bower install`

  3. Then lastly run `gulp serve` which will serve up a dev version, with some filewatchers working.

_Note that the guide hasn't been adapted to production purposes and may change.

Other useful `gulp` commands:

- `gulp watch` to start the server with a watch on file changes.
- `gulp lint` to run JSHint on all `.js` files in the `src` folder.
- `gulp test` to run all tests in the `spec` folder.

## Starting services

During development, you probably want to start each server-side service manually so you can start/stop them easily and watch their runtime behaviour. The following console commands shows how to start each service in the current Vagrant environment;

- `/usr/bin/mongod --dbpath /home/vagrant/data/db/` - starts mongo
- `/home/vagrant/redis-2.8.17/src/redis-server redis.conf` - starts redis
- `/bite/node_modules/gulp/bin/gulp.js /bite/app.js` - starts the node app
