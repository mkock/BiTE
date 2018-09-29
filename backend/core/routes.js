/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var genericApi = require('./../apis/generic');
// var cacheApi = require('./../apis/cache');
var usersApi = require('./../apis/users');
var itemsApi = require('./../apis/contentitems');
var typesApi = require('./../apis/contenttypes');
var tagsApi = require('./../apis/tags');
var templatesApi = require('./../apis/templates');
var statsApi = require('./../apis/stats');

// Export routes.
// REMEMBER: Routes are matched in order of appearance, from top to bottom.
module.exports = function(router) {
    // Generic routes;
    router.get('/status', genericApi.status);
    router.get('/copyright', genericApi.copyright);
    router.get('/cache/info', genericApi.getCacheInfo);

    // Routes that are always executed.
    router.route('/v1/*')
        // .get(cacheApi.serve) // under development.
        .get(tagsApi.autosync);

    // Routes related to authentication.
    router.route('/v1/authenticate/:username')
        .get(usersApi.authenticate);
    router.route('/v1/login/:response')
        .get(usersApi.login);
    router.route('/v1/tokens/:token/validate')
        .get(usersApi.validateAccessToken);
    router.route('/v1/tokens/:token/renew')
        .put(usersApi.renewAccessToken);
    router.route('/v1/tokens/:token')
        .get(usersApi.getAccessToken);

    // Routes related to users.
    router.route('/v1/users/:user')
        .get(
            usersApi.checkAccessToken,
            usersApi.preload,
            usersApi.getByUsername,
            usersApi.wrapAndSend
        )
        .put(
            usersApi.checkAccessToken,
            usersApi.preload,
            usersApi.putUser
        );
    router.route('/v1/users')
        .get(
            usersApi.checkAccessToken,
            usersApi.getUsers,
            usersApi.wrapAndSend
        )
        .post(
            usersApi.checkAccessToken,
            usersApi.postUser
        );

    // Routes related to contentitems;
    router.route('/v1/frontpage')
        .get(
            itemsApi.getFrontPage,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );
    router.route('/v1/tags/:tag/contentitems/first')
        .get(
            tagsApi.preload,
            itemsApi.getFirstByTag,
            itemsApi.addContextNav,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );
    router.route('/v1/tags/:tag/contentitems/last')
        .get(
            tagsApi.preload,
            itemsApi.getLastByTag,
            itemsApi.addContextNav,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );
    router.route('/v1/tags/:tag/contentitems/:item/next')
        .get(
            tagsApi.preload,
            itemsApi.preload,
            itemsApi.getNextByTag,
            itemsApi.addContextNav,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );
    router.route('/v1/tags/:tag/contentitems/:item/prev')
        .get(
            tagsApi.preload,
            itemsApi.preload,
            itemsApi.getPrevByTag,
            itemsApi.addContextNav,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );
    router.route('/v1/tags/:tag/contentitems/:item')
        .get(
            tagsApi.preload,
            itemsApi.preload,
            itemsApi.getOneByTag,
            itemsApi.thenAddView,
            itemsApi.addContextNav,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );
    router.route('/v1/tags/:tag/contentitems')
        .get(
            tagsApi.preload,
            itemsApi.getByTag,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );
    router.route('/v1/contentitems/:item/upvote')
        .post(
            itemsApi.preload,
            itemsApi.upvote
        );
    router.route('/v1/contentitems/:item/downvote')
        .post(
            itemsApi.preload,
            itemsApi.downvote
        );
    router.route('/v1/contentitems/:item/addview')
        .post(
            itemsApi.preload,
            itemsApi.addView
        );
    router.route('/v1/contentitems/:item/addtag/:tag')
        .post(
            usersApi.checkAccessToken,
            itemsApi.preload,
            tagsApi.preload,
            itemsApi.addTag
        );
    router.route('/v1/contentitems/:item/removetag/:tag')
        .post(
            usersApi.checkAccessToken,
            itemsApi.preload,
            tagsApi.preload,
            itemsApi.removeTag
        );
    router.route('/v1/contentitems/:item/sync')
        .put(
            usersApi.checkAccessToken,
            itemsApi.preload,
            itemsApi.synchronize
        );
    router.route('/v1/contentitems/:item')
        .get(
            itemsApi.preload,
            itemsApi.getById,
            itemsApi.extendItemsWithTags,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        )
        .put(itemsApi.preload, itemsApi.putItem);
    router.route('/v1/contentitems')
        .post(
            usersApi.checkAccessToken,
            itemsApi.checkContentType,
            itemsApi.checkTags,
            itemsApi.postItem
        )
        .get(
            tagsApi.preloadFiltered,
            itemsApi.getItems,
            itemsApi.extendItemsWithTags,
            itemsApi.extendItemsWithTemplates,
            itemsApi.reformTags,
            itemsApi.trimContent,
            itemsApi.trimExcess,
            itemsApi.wrapAndSend
        );

    // Routes related to contenttypes;
    router.route('/v1/contenttypes/:type')
        .get(
            typesApi.preload,
            typesApi.getById,
            typesApi.wrapAndSend
        )
        .put(typesApi.preload, typesApi.putType);
    router.route('/v1/contenttypes')
        .post(
            usersApi.checkAccessToken,
            typesApi.ensureNotExists,
            typesApi.postType
        )
        .get(
            typesApi.getTypes,
            typesApi.wrapAndSend
        );

    // Routes related to tags;
    router.route('/v1/tags/:tag/sync')
        .put(
            usersApi.checkAccessToken,
            tagsApi.preload,
            tagsApi.synchronize
        );
    router.route('/v1/tags/:tag/setpriority/:prio')
        .put(
            usersApi.checkAccessToken,
            tagsApi.preload,
            tagsApi.setPriority
        );
    router.route('/v1/tags/:tag')
        .get(
            tagsApi.preload,
            tagsApi.getById,
            tagsApi.extendTagsWithTemplates,
            tagsApi.extendTagsWithFirstItems,
            tagsApi.reformDynamicTags,
            tagsApi.trimImages,
            tagsApi.wrapAndSend
        )
        .put(
            usersApi.checkAccessToken,
            tagsApi.preload,
            tagsApi.putTag
        )
        .delete(
            usersApi.checkAccessToken,
            tagsApi.preload,
            tagsApi.deleteTag
        );
    router.route('/v1/tags')
        .post(
            usersApi.checkAccessToken,
            tagsApi.postTag
        )
        .get(
            tagsApi.getTags,
            tagsApi.extendTagsWithTemplates,
            tagsApi.extendTagsWithFirstItems,
            tagsApi.reformDynamicTags,
            tagsApi.trimImages,
            tagsApi.wrapAndSend
        );

    // Routes related to templates;
    router.route('/v1/templates/:template')
        .get(
            templatesApi.preload,
            templatesApi.getById,
            templatesApi.wrapAndSend
        )
        .put(
            usersApi.checkAccessToken,
            templatesApi.preload,
            templatesApi.putTemplate
        );
    router.route('/v1/templates')
        .get(
            templatesApi.getTemplates,
            templatesApi.wrapAndSend
        )
        .post(
            usersApi.checkAccessToken,
            templatesApi.ensureNotExists,
            templatesApi.postTemplate
        );

    // Routes related to tag stats;
    router.route('/v1/tags/:tag/upvotes/total')
        .get(tagsApi.preload, statsApi.getUpvotesTotalByTag);
    router.route('/v1/tags/:tag/downvotes/total')
        .get(tagsApi.preload, statsApi.getDownvotesTotalByTag);

    // Routes related to contenttype stats;
    router.route('/v1/contenttypes/:type/upvotes/total')
        .get(typesApi.preload, statsApi.getUpvotesTotalByType);
    router.route('/v1/contenttypes/:type/downvotes/total')
        .get(typesApi.preload, statsApi.getDownvotesTotalByType);
};
