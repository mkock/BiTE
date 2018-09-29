/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var util = require('util');
var mongo = require('mongodb');
var config = require('./config');
var client = mongo.MongoClient;
var db, connString;

// Utility function that generates the database connection string based on
// available configuration; it also handles connection string for replication
// sets and assumes that no authentication is required when credentials are
// absent.
var getConnectionString = function() {
    var creds;
    // First we need authentication credentials if they are provided.
    if (config.mongodbUser && config.mongodbPass) {
        creds = util.format('%s:%s@', config.mongodbUser, config.mongodbPass);
    } else if (config.mongodbUser && !config.mongodbPass) {
        creds = config.mongodbUser + '@';
    } else {
        creds = '';
    }
    if (config.mongodbReplSet) {
        // A replication set is defined, which means we are in an environment
        // using multiple replicated instances.
        return util.format(
            'mongodb://%s%s/%s?replSet=%s',
            creds,
            config.mongodbHost,
            config.mongodbDb,
            config.mongodbReplSet
        );
    } else {
        // Assuming no replication set.
        return util.format(
            'mongodb://%s%s:%d/%s',
            creds,
            config.mongodbHost,
            config.mongodbPort,
            config.mongodbDb
        );
    }
};

// Export function that connects to MongoDB.
module.exports.connect = function(errorHandler) {
    var defaultErrorHandler = function(error, database) {
        if (error) {
            throw error;
        }
        db = database;
    };
    client.connect(getConnectionString(), errorHandler || defaultErrorHandler);
};

// Export function that closes the connection.
module.exports.disconnect = function(callback) {
    db.close(callback);
};

// Export function that returns a collection.
module.exports.collection = function(name) {
    return db.collection(name);
};

// Export function that creates an ObjectId.
module.exports.getId = function(value) {
    return new mongo.ObjectID(value);
};

// Function that tests whether or not string is a MongoDB hash.
module.exports.isHash = function(hash) {
    return /[0-9a-f]{24}/.test(hash);
};

// Function that converts a time string such as "2014-10-19T15:00:00"
// into the preferred date/time format used in the database
// (which is currently a UNIX timestamp).
module.exports.toDbTime = function(time) {
    var date;
    if (time === undefined || time === null) {
        date = new Date();
    } else {
        date = new Date(time);
    }
    return parseInt(Math.floor(date.getTime() / 1000));
};
