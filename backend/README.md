BiTE Backend
============

## Introduction

This documentation is in three parts;

  * [Readme for the BITE Backend](/backend/README.md).
  * ~~Readme for the BITE Frontend.~~
  * ~~Readme for the BITE Admin.~~

## Description

Provides a REST-based API layer on top of a MongoDB database, designed to handle content related to the BITE Project (BT for juveniles).

The API is built in `nodejs`, and utilizes `gulp` as task runner for starting,
stopping, debugging and other practical tasks.

## Application architecture

The main file is ``app.js``. It sets up the app using ``Expressjs`` and configures security, routing, web socket connectivity etc. and starts the actual web server.

The entire app is comprised of three directories - ``apis``, ``core`` and ``models``;

- The ``models`` directory contains all the business logic related to stored and cached content, and must not contain any dependencies to the request/response environment provided by ``Expressjs``.
- The ``apis`` directory contains all request/response logic including checking and handling of request parameters and reacting to errors and content from the business layer. This layer must not contain any app-centric logic.
- The ``core`` directory contains common code that is not directly related to the business logic, but instead related to the functionality of the app itself, such as route configuration, the database layer, input validation, app configuration etc.

In the ``core/routes.js`` file, each method type (``GET``, ``PUT``, ``POST`` etc.) is made up of several calls to functions in the API layer; at any point during those calls, an error can be generated, which effectively halts execution and sends a proper response back to the client. When no errors are generated, each function is called in sequence, preloading content and saving it in the request/response scope (``response.locals``) so it will be available to subsequent functions. This "call chain" allows for flexibility as the app evolves, and helps to keep the responsibilities of each function small.

Separate functions are usually called at the end of the call chain, whose sole purpose are to collect the computed results and put them in a response.

## Data Store

The MongoDB database currently contains the following collections:

- `contentitems` is a general representation of some kind of page content 
- `contenttypes` acts as a category to separate content into different types
- `tags` is used for providing an alternative form of categorization
- `templates` provides named rendering templates with styling information
- `users` contains information about users authenticating against the API
- `access` provides a whitelist of URLs that are allowed to access the API

## Security

On top of the access control described earlier, we have _authentication_ for protecting the sensitive parts of the API. It's currently not necessary to authenticate against each and every possible API call, only those that are sensitive and may be dangerous to make publicly available. Authentication applies to most ``PUT`` and ``POST`` calls (exceptions are those used by the frontend), and also a few of the ``GET`` calls related to user management, since we don't want to expose user information to the public. And even if we did, the passwords always show up mangled in the response.

### Authentication

Authentication is implemented as a handshake using SHA-256 encrypted data exchanges to avoid password sniffing etc. This lessens the need to run the API over an SSL-encrypted connection, although it's not recommended; access tokens can still be sniffed and used until they expire.

Here's how it works:

  * The client sends his username in an authentication call: ``GET /api/v1/authenticate/johndoe``
  * The server responds with a challenge (a public key), which is stored server-side for 60 seconds only.
  * The client appends his password to the challenge, SHA-256 encrypts it, and sends it to the server in a login call: ``GET /api/v1/login/...``.
  * If the server is able to match the client response against the server-side hash, the authentication is successful, and a temporary access token is generated, which is valid for approximately 60 minutes (this may change). The access token is returned to the client, who can then send it as the header "Access-Token": "..." together with any API call that requires authentication.

As long as the access token is valid, the client can call an API operation to renew it before it expires (not yet implemented).

## Application dependencies

Apart from the app itself and its related database, cache store etc. there are a couple of first- and third-party services that must be reachable from the backend. They are introduced below:

  * _BOND_ - we currently establish a connection to two different BOND API's in order to synchronize articles. The BOND API's are REST-based and the current configuration expects them to be available from [the BT website](http://www.bt.dk), although this can be changed. Both API's are read-only and the backend will never attempt to modify articles in BOND.

  * _Cloudinary_ - this is a third-party cloud service that does automated image manipulation for us, such as resizing, scaling, desaturating and cropping. We've chosen a third-party service to avoid installing elaborate image manipulation software on our servers as we try to keep them relatively light-weight. Read more on [the Cloudinary website](http://cloudinary.com/).

  * _Amazon S3_ - apart from running our test- and production environments on Amazon EC2 instances, we also store all image files in an Amazon S3 bucket. Although Cloudinary offers image storage and a CDN as part of the package, we have chosen to store our images in a vendor-independent location (S3), which allows us to change from Cloudinary to another vendor without losing our infrastructure for storing and accessing our images.

Other dependencies may be added in the future.

## Notes for developing

- There are many ways to check types of variables in ``node.js``. In this project, please stick to using ``underscore.js`` for all type checks in order to ensure a consistent style.

- Since ``MongoDB`` can receive arbitrary data as posted by the client, it's intended to add a form of JSON schema validation at some point (there are npm packages for this).

- ``Redis`` is used for _storing user sessions_ and as a _content cache_. It's possible to combine redis with [hiredis](https://github.com/redis/hiredis) to achieve higher performance, but be aware of the downside (requires recompilation during package upgrades). ``hiredis`` is not installed due to this downside and the fact that it would be premature optimization.

- When developing, please follow the _redis naming strategy_, which is to use a custom namespacing with each namespace separated by colons, and by keeping related data "grouped" together in similar namespaces. For example, BOND articles are stored under the key ``feed:bond:node:<id>:content``, while related metadata such as expiration time is stored under ``feed:bond:node:<id>:expire``. Also, content stored in ``Redis`` should always be assigned a TTL to avoid filling up the memory with stale data.

- It might be feasible to store more than just external feeds (e.g. MongoDB collections) in ``Redis`` for fast retrieval. Setting a fairly low TTL on this type of cached content protects us from expiring cache entries when the original content is modified, and furthermore reduces the load on MongoDB.

- If both the frontend and Admin starts supporting _authentication_, a reasonable next step would be to extend authentication to cover the entire API.

## Notes for testing

- Set the environment variable ``DEBUG="*"`` before starting the app to get debugging output on stdout. Be warned that this will output debugging information for most - if not all - NPM modules. To get a more restrained output that is more specific to the BiTE functionality itself, set the variable to ``DEBUG="bite:*"`` instead. Get more details about debugging at [the NPM page for debug](https://www.npmjs.com/package/debug).

- The current test servers running on two dedicated AWS EC2 instances need
  some configuration before everything will run smoothly. First of all, we
  currently set up environment variables required by the node app, in a service
  definition file located at ``/etc/init/bite.conf``. Secondly, once the app
  is running, since it won't be running with root privileges, it will run on
  port 5000 (or another port that you define which is a number larger than 2014)
  and therefore needs some internal re-routing before it becomes available on
  port 80. You'll need to run the following two commands as root:

    ``iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT``

    ``iptables -A PREROUTING -t nat -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 5000``

  That should do the trick.

## Notes for production

- The app behaves differently based on the environment declaration - for
  example, SSL is enabled in "production" only. The default environment is
  "development" unless declared otherwise. In production, it's therefore
  particularly important to declare the environment correctly, by setting an
  environment variable:

    ``export NODE_ENV="production"``

## API Operations

The following is a list of RESTful operations that the API exposes.
**Note:** Also see `src/routes.js` for a nice overview of the supported routes.
**Note:** While there is flexibility built into most GET requests for fetching objects by both id, slug, name etc. (where stated), PUT/POST requests generally only accept id's.
**Note:** Every time a GET request is performed, an "autosync" algorithm will start. This algorithm will synchronize any tag that isn't already in the middle of a synchronization and which hasn't been synchronized within a certain period (which is 5 minutes by default). This "autosync" behaviour can be skipped manually by providing the query parameter `autosync=no` with the GET request. This may be useful in certain circumstances, such as when using authentication methods.

### Authentication

- `GET /api/v1/authenticate/:username` - authenticate as user; server will respond with a challenge (public key) that needs to be verified in a `login` call.

- `GET /v1/login/:key` - login as user; `key` is a SHA-256 hash generated as described in the Security chapter. Login is granted when the server responds with an access token.

- `GET /api/v1/tokens/:token/validate` - validate an access token.

- `GET /api/v1/tokens/:token/renew` - renew an access token.

- `GET /api/v1/tokens/:token` - return an access token if it exists.

### Users

- `GET /api/v1/users/:username` - return the given user by id or username if it exists.

- `GET /api/v1/users` - return a list of all existing users.

- `POST /api/v1/users` - create a new user.

- `PUT /api/v1/users/:username` - update user by id or username.

### Contentitems

- `GET /api/v1/frontpage` - retrieve contentitems that should appear on the front page.

- `GET /api/v1/contentitems/:id` - retrieve contentitem by id

  Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly from source (slow); only relevant when `trimitems=no`
  - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)

- `GET /api/v1/tags/:tag/contentitems` - retrieve contentitems by tag id or slug, sorted by position in the list made up by the tag

  Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly from source (slow); only relevant when `trimitems=no`
  - set `pubfrom=[0-9]*` to retrieve contentitems published *after* the given UNIX timestamp
  - set `pubto=[0-9]*` to retrieve contentitems published *before* the given UNIX timestamp
  - set `sortby=upvotes|downvotes|views|priority` to sort by most upvoted, most downvoted, most viewed or in order of appearance in the tag (default value is `priority`)
  - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)

- `GET /api/v1/tags/:tag/contentitems/first` - retrieve first contentitem by tag id or slug, as it appears in the list made up by the tag.

  Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly from source (slow); only relevant when `trimitems=no`
  - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)

- `GET /api/v1/tags/:tag/contentitems/last` - retrieve last contentitem by tag id or slug, as it appears in the list made up by the tag.

  Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly from source (slow); only relevant when `trimitems=no`
  - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)

- `GET /api/v1/tags/:tag/contentitems/:item/next` - retrieve next contentitem relative to current one, as defined by the given item id or slug and the given tag id or slug.

  Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly from source (slow); only relevant when `trimitems=no`
  - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)

- `GET /api/v1/tags/:tag/contentitems/:item/prev` - retrieve previous contentitem relative to current one, as defined by the given item id or slug and the given tag id or slug.

  Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly from source (slow); only relevant when `trimitems=no`
  - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)

  Set both `pubfrom` and `pubto` to retrieve contentitems published within the interval defined by those two UNIX timestamps.

- `GET /api/v1/tags/:tag/contentitems/:item` - retrieve given contentitem as defined by the given item id or slug and the given tag id or slug.

  Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly from source (slow); only relevant when `trimitems=no`
  - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)
  - set `addview=no` to retrieve the contentitem without counting the retrieval as a view. Without this option, a single view will be recorded.

- `PUT /api/v1/contentitems/:id` - update contentitem by id
- `GET /api/v1/contentitems` - retrieve paginated contentitems, sorted by name

   Query options:

  - set `trimitems=yes` to omit remote content from each item
  - set `skipcache=yes` to skip the local cache and fetch content directly 
  - set `page=[0-9]*` to retrieve a (1-indexed) specific page of results (defaults to 1)
   - set `pagesize=[0-9]*` to specify number of results to display per page (defaults to 10)
   - set `sortby=upvotes|downvotes|views|name` to sort by most upvoted, most downvoted, most viewed or by name (default is `name`)
   - set `extendtags=yes` to extend nested tag stubs with full objects (default value="yes")
  - set `extendtemplates=yes` to extend nested template stubs with full objects (default value="yes"; only works in tandem with `extendtags=yes`)

- `POST /api/v1/contentitems` - create new contentitem

- `POST /api/v1/contentitems/:id/upvote` - upvotes contentitem by one, identified by id/slug

- `POST /api/v1/contentitems/:id/downvote` - downvotes contentitem by one, identified by id/slug

- `POST /api/v1/contentitems/:id/addview` - increments a contentitem view counter by one, identified by id/slug

- `POST /api/v1/contentitems/:id/addtag/:tag` - adds tag with given id/slug to contentitem with given id/slug

- `POST /api/v1/contentitems/:id/removetag/:tag` - removes tag with given id from contentitem

### Contenttypes

- `GET /api/v1/contenttypes/:id` - retrieve contenttype by id/slug

- `GET /api/v1/contenttypes` - retrieve paginated contenttypes, sorted by name

   Query options:

   - set `page=[0-9]*` to retrieve a (1-indexed) specific page of results (defaults to 1)
   - set `pagesize=[0-9]*` to specify number of results to display per page (defaults to 10)

- `PUT /api/v1/contenttypes/:id` - update contenttype by id

- `POST /api/v1/contenttypes` - create new contenttype

### Tags

- `GET /api/v1/tags/:id` - retrieve tag by id/slug

Query options:

- set `extendtemplates=yes` to extend tags with full template objects
- set `extendfirstitems=yes` to extend tags with their first contentitems

- `GET /api/v1/tags` - retrieve paginated tags, sorted by creation date (newest first)

   Query options:

   - set `filter=all|frontpage|tiles|menu` to fetch only those tags which appear on the frontpage, in tiles or in menus (defailt is `all`)
   - set `page=[0-9]*` to retrieve a (1-indexed) specific page of results (defaults to 1)
   - set `pagesize=[0-9]*` to specify number of results to display per page (defaults to 10)
   - set `extendtemplates=yes` to extend tags with full template objects
   - set `extendfirstitems=yes` to extend tags with their first contentitems

- `PUT /api/v1/tags/:id/setpriority/:prio` - change tag priority; `:prio` should be a positive integer, the lowest valid priority being zero. This only affects the current tag and does not prevent two tags from receiving the same priority.

- `PUT /api/v1/tags/:id` - update tag by id

- `POST /api/v1/tags` - create new tag

- `PUT /api/v1/tags/:id/sync` - synchronize tag by id/slug; a response is returned immediately, and the synchronization scheduled to be executed immediately, but there will be a delay before the tag and its related contentitems are actually updated. The field `tag.synced` will change when the synchronization has completed.

### Templates

- `GET /api/v1/templates/:id` - retrieve template by id

- `PUT /api/v1/templates/:id` - update template by id

- `GET /api/v1/templates` - fetch all templates, with pagination

- `POST /api/v1/templates` - create new template

### Statistics

- `GET /api/v1/contenttypes/:typeid/upvotes/total` - retrieve most upvoted contentitems of given contenttype

   Query options:

   - set `count=[0-9]*` to limit the number of items to retrieve
   - set `order=[max|min]` to get most/least upvoted)

- `GET /api/v1/contenttypes/:typeid/downvotes/total` - retrieve most downvoted contentitems of given contenttype

  Query options:

  - set `count=[0-9]*` to limit the number of items to retrieve
  - set `order=[max|min]` to get most/least downvoted)

- `GET /api/v1/tags/:tag/upvotes/total` - retrieve most upvoted contentitems tagged with the given tag

   Query options:

   - set `count=[0-9]*` to limit the number of items to retrieve
   - set `order=[max|min]` to get most/least upvoted)

- `GET /api/v1/tags/:tag/downvotes/total` - retrieve most downvoted contentitems tagged with the given tag

  Query options:

  - set `count=[0-9]*` to limit the number of items to retrieve
  - set `order=[max|min]` to get most/least downvoted)

### Generic

- `GET /api/status` - display status of server-side services
- `GET /api/copyright` - display copyright information
- `GET /api/cache/info` - display some useful information about redis
