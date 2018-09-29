/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var async = require('async');
var _ = require('underscore');
var util = require('util');
var config = require('./../core/config');
var cloudinary = require('cloudinary');
var imgcache = require('./../models/imgcache');

// Init Cloudinary.
cloudinary.config({
	'cloud_name': config.cloudinary.cloud_name,
	'api_key': config.cloudinary.api_key,
	'api_secret': config.cloudinary.api_secret
});

// Function that uploads a single image to Cloudinary.
module.exports.upload = function(params, nextFunc) {
	var file = params.url || params.path,
		type = params.type,
		pathId = params.pathId,
		uploadFileName = params.fileName,
		imagePresetsObject = config.imagepreset[type],
		imagePresetsArray = _.values(imagePresetsObject),
		options = {
			'eager': imagePresetsArray,
			'eager_async': false
		};
	cloudinary.uploader.upload(file, function(result) {
		if (result.error) {
			console.log("Cloudinary error: " + result.error.message);
			return nextFunc(null, null);
		}
		var images = _.object(_.keys(imagePresetsObject), result.eager);
		images.original = {
			'width': result.width,
			'height': result.height,
			'url': result.url,
			'secure_url': result.secure_url
		};
		return module.exports.uploadOnAmazon({
			'images': images,
			'type': type,
			'pathId': pathId,
			'fileName': uploadFileName
		}, nextFunc);
	}, options);
};

// Function that uploads a single image to AWS S3.
module.exports.uploadOnAmazon = function(params, nextFunc) {
	var type = params.type,
		pathId = params.pathId,
		fileName = params.fileName,
		imagesObject = setImageUploadPath(params.images, type, pathId),
		imagesArray = _.values(imagesObject);
	async.mapSeries(imagesArray, function(image, nextFunc) {
		imgcache.uploadExternal({
			'url': image.url,
			'uploadPath': image.uploadPath,
			'fileName': fileName
		}, function(error, url) {
			if (error) {
				console.log('Unable to upload external image to AWS S3');
				return nextFunc(error, null);
			}
			image.url = url;
			return process.nextTick(function() {
				return nextFunc(null, image);
			});
		});
	}, function(err, results) {
	    var images = _.object(_.keys(imagesObject), results);
	    return nextFunc(null, images);
	});
};

// Function that returns an array containing AWS S3 upload paths based on
// image information such as image type/category and related objects.
var setImageUploadPath = function(images, type, pathId) {
    for (var mediatype in images) {
		images[mediatype].uploadPath = imgcache.getUploadPath(
			type, pathId, mediatype
		);
	}
    return images;
};
