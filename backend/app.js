/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Configuration.
var sessionOptions = {
    'store': null, // Modified later.
    'cookie': {'secure': false}, // Modified later.
    'secret': 'Monkey see, monkey do',
    'resave': true,
    'saveUninitialized': true
};

// Require external dependencies.
var compression = require('compression');
var util = require('util');
var express = require('express');
var clusterManager = require('cluster2');
var session = require('express-session');
var redisStore = require('connect-redis')(session);
var redis = require('redis');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var http = require('http');
var socketIo = require('socket.io');
var appsec = require('lusca');
var favicon = require('serve-favicon');
var modRewrite = require('connect-modrewrite');
var db = require('./core/database');
var routes = require('./core/routes');
var talk = require('./core/talk');
var delegate = require('./core/delegate');
var access = require('./core/access');
var config = require('./core/config');
var options = require('./core/options');
var openGraph = require('./core/opengraph');
var imageCache = require('./models/imgcache');
var app, router, server, cluster, io, client;

// Ensure that the download directory exists.
imageCache.ensureDownloadDir(function(error) {
    if (error) {
        console.log(error);
        process.exit(1);
    }
});

// Connect to MongoDB.
db.connect();

// Init app and router.
app = express();
router = express.Router();

// Set up session storage (including redis connectivity).
client = redis.createClient(config.redisPort, config.redisHost, {});
sessionOptions.store = new redisStore({'client': client});

// Set up web sockets.
server = http.Server(app);
io = socketIo(server);
io.on('connection', function(socket) {
    talk.init(socket).receive(function() {
        delegate.init(talk);
    });
});

// Production specifics, ie. SSL support.
// Currently untested; see https://github.com/expressjs/session.
if (app.get('env') === 'production') {
    app.set('trust proxy', 1); // Trust first proxy.
    sessionOptions.cookie.secure = true; // Serve secure cookies.
}

// App setup, including security and custom headers.
app.use(compression());
app.use(session(sessionOptions));
if (app.get('env') === 'production') {
    // Set up NginX-style logging for production.
    morgan.token('x_forwarded_for', function(request, response) {
        return request.headers.x_forwarded_for;
    });
    morgan.token('host', function(request, response) {
        return request.headers.host;
    });
    app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time X-Forwarded-For=:x_forwarded_for Host=:host'));
} else {
    // Set up dev-style logging for non-production.
    app.use(morgan('dev'));
}

// Parse request body as JSON.
app.use(bodyParser.json());
// No IP restrictions on incoming requests - we use auth instead.
app.use(access.unrestricted);
// CSRF requires cookies which are difficult to do right in AJAX.
// app.use(appsec.csrf());
app.use(appsec.xframe('SAMEORIGIN'));
app.use(function(request, response, nextFunc) {
    // Set CSRF token in every response.
    // response.header('X-CSRF', response.locals._csrf);
    // Set ServedBy header on every response
    response.header('ServedBy', config.servedBy);
    return nextFunc();
});
// Validate GET options.
app.use(options.validate);
// Use routing component.
app.use('/api', router);
// Respond with 404 Not Found for unmatched API requests.
app.use('/api', function(request, response, nextFunc) {
    // This function will catch unmatched API routes and send the expected
    // 404 Not Found header instead of falling through to the frontend routing.
    response.status(404).send(util.format(
        'Cannot %s %s', request.method, request.originalUrl
    ));
});
routes(router);

// Start server using cluster2.
cluster = new clusterManager({
    'cluster': true,
    'port': config.appPort
});
cluster.on('died', function(pid) {
    console.log('Worker ' + pid + ' died');
});
cluster.on('forked', function(pid) {
    console.log('Worker ' + pid + ' forked');
});
cluster.on('SIGKILL', function() {
    console.log('Got SIGKILL');
});
cluster.on('SIGTERM', function(event) {
    console.log('Got SIGTERM - shutting down');
});
cluster.on('SIGINT', function() {
    console.log('Got SIGINT');
});
cluster.listen(function(callback) {
    return callback(app);
});
console.log(
    'Server process running in %s mode at http://%s:%d/',
    app.get('env'),
    'localhost',
    config.appPort
);

// Serve the favicon as a special case.
app.use(favicon(__dirname + '/../favicon.ico'));

// Serve static files out of the "admin" directory.
app.use('/admin', express.static(__dirname + '/../admin'));

// Serve static test files out of the "test" directory.
app.use('/test', express.static(__dirname + '/../test'));

// Serve static test files out of the "documentation" directory as long as
// we're not in production.
if (app.get('env') !== 'production') {
    app.use('/documentation', express.static(__dirname + '/../documentation'));
}

// Serve opengraph meta tags when matching certain user agents (crawlers).
app.use('/:tag/:item', openGraph);

// Rewriting rule for clean urls.
app.use(modRewrite([
    '!\\.\\w+$ /index.html [L]'
]));

// Serve static files out of the "frontend" directory.
app.use(express.static(__dirname + '/../frontend/dist'));
