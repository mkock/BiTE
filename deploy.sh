#!/usr/bin/env bash

##### General setup #####
command -v npm >/dev/null 2>&1 || { echo >&2 "Need npm. Aborting."; exit 1; }
npm install gulp || { exit 1; }

##### Setup backend #####
# Install Node.js modules
npm install --production || { exit 1; }
npm update || { exit 1; }

##### Setup frontend #####
cd frontend  || { exit 1; }
npm install bower || { exit 1; }
npm install || { exit 1; }
npm update || { exit 1; }
./node_modules/bower/bin/bower install || { exit 1; }
./node_modules/bower/bin/bower update || { exit 1; }
./node_modules/gulp/bin/gulp.js build || { exit 1; }

##### Done #####
cd ./..
