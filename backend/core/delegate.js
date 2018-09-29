/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

var util = require('util');
var events = require('events');
var tagsDb = require('./../models/tags');

// Inherit from EventEmitter.
var delegate = new events.EventEmitter();

// Call this function first to init socket.
delegate.init = function(talk) {
    this.talk = talk;
    return this;
};

// Handle "item-upvoted" event.
// Note; this.talk will be undefined if no clients are connected.
delegate.on('item-upvoted', function(itemObject) {
    if (this.talk) {
        this.talk.say('notice', {'notice': 'Received upvote event'});
    }
});

// Handle "item-downvoted" event.
// Note; this.talk will be undefined if no clients are connected.
delegate.on('item-downvoted', function(itemObject) {
    if (this.talk) {
        this.talk.say('notice', {'notice': 'Received downvote event'});
    }
});

// Handle "item-viewed" event.
// Note; this.talk will be undefined if no clients are connected.
delegate.on('item-viewed', function(itemObject) {
    if (this.talk) {
        this.talk.say('notice', {'notice': 'Received view event'});
    }
});

// Handle "tag-added" event.
// Note; this.talk will be undefined if no clients are connected.
delegate.on('tag-added', function(tagObject) {
    if (this.talk) {
        this.talk.say(
            'notice', {'notice': util.format('Tag %s added', tagObject.tag)}
        );
        // Just for kicks - send a new tag list to clients.
        var self = this;
        tagsDb.getTags('all', null, null, function(error, cloud) {
            self.talk.say('cloud', cloud);
        });
    }
});

// Export the module.
module.exports = delegate;
