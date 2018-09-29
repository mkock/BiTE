/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var config = require('./../core/config');
var twitter = require('twitter');

// Twitter API configuration.
var options = {
    'defaultLimit': 10,
    'trimUser': true
};

// Connect to Twitter.
var twit = new twitter({
    'consumer_key': config.twitterConsumerKey,
    'consumer_secret': config.twitterConsumerSecret,
    'access_token_key': config.twitterAccessTokenKey,
    'access_token_secret': config.twitterAccessTokenSecret
});

// Function which returns another function that will fetch tweets.
module.exports.getTimeline = function(item) {
    var params = {
        'screen_name': item.data.twittername,
        'count': item.data.count || options.defaultLimit,
        'trim_user': item.data.trimuser || options.trimUser
    };
    return function(nextFunc) {
        twit.get(
            '/statuses/user_timeline.json', params, function(tweets) {
                nextFunc(null, tweets);
            }
        );
    };
};
