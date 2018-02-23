const express = require('express'),
    bodyParser = require('body-parser'),
    config = require('./config'),
    async = require('async'),
    timeout = require('connect-timeout'),
    basicAuth = require('express-basic-auth'),
    doCluster = require('./lib/cluster'),
    logger = require('./lib/logger');


const app = express();

app.set('port', (process.env.PORT || 8080));
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');
app.use(express.static(__dirname + '/resources'));
app.use(bodyParser.urlencoded({extended: false}));
app.use(timeout(config.server_timeout_seconds + 's'));
app.use(bodyParser.json());

let dashboard_user;
if (config.enable_basic_auth) {
    dashboard_user = {};
    dashboard_user[config.basic_auth_user] = config.basic_auth_password;
    app.use(basicAuth({
        users: dashboard_user,
        challenge: true,
        realm: "ecs-dashboard"
    }));
}

const doRenderResults = (res) => {
    return function (err, clusterInfo) {
        
        let errors;
        if (err) {
            errors = {message: err.message};
            clusterInfo = {
                "clusterName": "",
                "zones": []
            }
        } else {
            errors = {display: 'hide'};
        }
        
        res.render('overview', {errors: errors, config: config, cluster: clusterInfo});
    };
};

const doRenderOptions = (res, options) => {
    return function (err, options) {
        console.log("render options "+ options)
        let errors;
        if (err) {
            errors = {message: err.message};
            if (!options) {
                options = [];
            }
        } else {
            errors = {display: 'hide'};
        }
        res.render('options', {errors: errors, config: config, options: options});
    }
}

let lastUpdate;
let startTime;

app.get('/', (req, res) => {
    startTime = new Date().getTime();
    
    let renderOptions = doRenderOptions(res);

    doCluster.getAvailabileClusters(function (err, options) {
        if (!err) {
            logger.info((new Date().getTime() - startTime) / 1000 + " seconds");
            lastUpdate = new Date();
        }
        // don't bother sending response if it has already timed out
        if (req.timedout) {
            logger.warn("Request already timed out - skip rendering");
            return;
        }
        console.log(options)
        renderOptions(err,  options);
    })

});

app.get('/cluster/:clusterName', (req, res) => {
    startTime = new Date().getTime();
    
    let renderResults = doRenderResults(res);


    doCluster.getClusterInfo(req.params['clusterName'], function (err, clusterInfo) {
        if (!err) {
            logger.info((new Date().getTime() - startTime) / 1000 + " seconds");
            lastUpdate = new Date();
        }
        // don't bother sending response if it has already timed out
        if (req.timedout) {
            logger.warn("Request already timed out - skip rendering");
            return;
        }
        renderResults(err, clusterInfo);
    })

});

app.listen(app.get('port'), () => {
    logger.info('running on port ', app.get('port'));
});
