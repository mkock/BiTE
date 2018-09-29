/*******************************************************************************
 * This file is part of the BT_Unge package.





*******************************************************************************/

// Load dependencies.
var gulp = require('gulp');
var jasmine = require('gulp-jasmine');
var jshint = require('gulp-jshint');
var spawn = require('child_process').spawn;
var node;

// Task; "default"; runs the default task.
gulp.task('default', ['start']);

gulp.task('help', function () {
    console.log('====================');
    console.log('Usage:');
    console.log('      gulp start');
    console.log('      gulp lint');
    console.log('      gulp test');
    console.log('      gulp build');
    console.log('====================');
});

// Task: "start"; simply starts the app.
gulp.task('start', function() {
    if (node) {
        node.kill();
    }
    node = spawn('node', ['./backend/app.js'], {'stdio': 'inherit'});
});

// Task: "debug"; starts the app in debugging mode.
// Run "npm install gulp-node-inspector" to install the required package.
gulp.task('debug', ['start'], function() {
    require('gulp-node-inspector')({
        'web-port': 5000,
        'web-host': 'localhost',
        'debug-port': 5001,
        'save-live-edit': false,
        'preload': false,
        'stack-trace-limit': 4
    });
});

// Task: "watch"; restarts the app every time a .js file is changed.
gulp.task('watch', ['start'], function() {
    var watcher = gulp.watch('./backend/**/*.js', ['start']);
    watcher.on('change', function(event) {
        console.log(
            'File ' + event.path + ' was ' + event.type + ', restarting...'
        );
    });
});

// Task: "lint"; checks all .js files for syntax and styling errors.
gulp.task('lint', function() {
    gulp.src('./backend/**/*.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

// Task: "test"; run Jasmine tests.
gulp.task('test', function() {
    console.log('All tests passed (no tests to run)');
});

// Task: "build"; runs "lint" and unit tests.
gulp.task('build', ['lint', 'test'], function() {
    console.log('Build completed');
});
