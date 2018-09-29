/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

var util = require('util');

var isLogEnabled = true;
var whisper = function(socket, message) {
    var ip = (socket ? socket.client.conn.remoteAddress : 'N/A');
    console.log(util.format(
        '[%s] %s %s',
        ip,
        new Date().toString(),
        message
    ));
};

// Call this function first to init the socket connection.
module.exports.init = function(socket) {
    this.socket = socket;
    return this;
};

// Export socket interactions.
module.exports.receive = function(nextFunc) {
    // Welcome message.
    this.socket.emit('notice', {'notice': 'Welcome to BITE!'});

    // Function that simply logs notices from clients.
    this.socket.on('notice', function(data) {
        whisper(this.socket, data.notice);
    });

    // Function that logs client disconnects.
    this.socket.on('disconnect', function() {
        // whisper(this.socket, 'Bye for now');
    });
    return nextFunc();
};

// Wrapper for emitting messages, which also checks the connection.
module.exports.say = function(event, message) {
    if (this.socket) {
        this.socket.emit(event, message);
    }
};

// Wrapper for emitting broadcast messages, which also checks the connection.
module.exports.yell = function(event, message) {
    if (this.socket) {
        this.socket.broadcast.emit(event, message);
    }
};
