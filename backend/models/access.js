/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
var db = require('./../core/database');

// Function that fetches information about a domain origin if it's whitelisted.
module.exports.getUrl = function(url, nextFunc) {
    var urlStdPort = url.replace(/:80[\/]?$/, '') + ':80';
    var conditions = {'$or': [{'url': url}, {'url': urlStdPort}]};
    db.collection('access').findOne(conditions, {}, function(error, result) {
        if (result && result.hasOwnProperty('url')) {
            // We were able to match the URL with one in the whitelist, so
            // in order to ensure that the browser is able to perform an exact
            // match against the Access-Control-Allow-Origin header, we use
            // the original URL.
            result.url = url;
        }
        nextFunc(error, result);
    });
};
