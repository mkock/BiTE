/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

/*
    Relevant reading:
    http://ogp.me/
    https://developers.facebook.com/docs/sharing/best-practices
    https://developers.facebook.com/docs/reference/opengraph/object-type/article
    https://dev.twitter.com/cards/getting-started

    Open graph extras
        // TTL. Limits crawler access if our crawler is being too aggressive.
        og:ttl

    Facebook specifics
        // The unique ID that lets Facebook know the identity of your site
        <meta name="fb:app_id" content="" />

        // Facebook page URL or ID of the publishing entity
        <meta name="article:publisher" content="bitedk" />

        // Array of Facebook profile URLs or IDs of the authors for this article
        // Not required
        <meta name="article:author" content="" />

    Twitter specifics
        // The card type, which will be one of “summary”, “summary_large_image”,
        // “photo”, “gallery”, “product”, “app”, or “player”.
        <meta name="twitter:card" content="summary_large_image" />

        // @username for the website used in the card footer.
        <meta name="twitter:site" content="@bitedk" />

        // @username for the content creator / author.
        // Not required
        <meta name="twitter:creator" content="" />
 */

// Load dependencies.
var itemsDb = require('./../models/contentitems');
var feed = require('./../models/feed');
var config = require('./config');

var whitelist = [
    // 'googlebot',
    // 'yahoo',
    // 'bingbot',
    'baiduspider',
    'facebookexternalhit',
    'twitterbot',
    'rogerbot',
    'linkedinbot',
    'embedly',
    'quora link preview',
    'showyoubot',
    'outbrain',
    'pinterest',
    'developers.google.com/+/web/snippet',
    'slackbot'
];

// Function that responds with a minimal HTML page containing Open Graph
// meta data when user agent is detected as a social media crawler.
module.exports = function (request, response, nextFunc) {
    if (matchesWhitelist(request.headers['user-agent'])) {
        itemsDb.getBySlug(request.params.item, function (error, item) {
            if (error) {
                return nextFunc(error);
            }
            if (item === null) {
                return nextFunc();
            }
            response.status(200).send([
                '<html prefix="og: http://ogp.me/ns#">',
                '<head>',
                '<title>' + item.title + '</title>',
                '<meta property="og:title" content="' + item.title + '" />',
                '<meta property="og:type" content="website" />',
                '<meta property="og:description" content="' + item.description + '" />',
                '<meta property="og:site_name" content="bite" />',
                '<meta property="og:locale" content="da_DK" />',
                '<meta property="og:locale:alternate" content="en_US" />',
                '<meta property="og:url" content="' + request.protocol + '://' + request.get('host') + request.originalUrl + '" />',
                '<meta property="og:image" content="' + item.image.images.original.url + '" />',
                '<meta property="og:image:width" content="' + item.image.images.original.width + '" />',
                '<meta property="og:image:height" content="' + item.image.images.original.height + '" />',
                '<meta name="fb:app_id" content="' + config.sharing.facebook.appId + '" />',
                '<meta name="article:publisher" content="bitedk" />',
                '<meta name="twitter:card" content="summary_large_image" />',
                '<meta name="twitter:site" content="' + config.sharing.twitter.username + '" />',
                '<meta name="twitter:description" content="' + item.description + '" />',
                '</head>',
                '<body>',
                item.body,
                '</body>',
                '</html>'].join(''));
        });
    } else {
        return nextFunc();
    }
};

// Function that checks whether or not the given string matches a whitelist.
var matchesWhitelist = function(input) {
    return whitelist.some(function(userAgent) {
        return input.match(userAgent) !== null;
    });
};
