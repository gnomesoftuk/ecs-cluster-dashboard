"use strict";

const config = require('../config'),
    fs = require('fs'),
    logger = require('./logger');

const awsConfig = function () {


    return {
        loadCredentials: function () {
            try {
                return JSON.parse(fs.readFileSync('credentials.json', {'encoding':'utf-8'}));
            } catch (e) {
                logger.info("no credentials file found.");
                return;
            }
        }
    };

}();

module.exports = awsConfig;