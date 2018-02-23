"use strict";

const _ = require('lodash'),
    async = require('async'),
    AWS = require('aws-sdk'),
    config = require('../config'),
    awsConfig = require('./credentials'),
    logger = require('./logger');

const doReadClusterInfo = function () {

    let that = {};

    let config = {
        "region": "eu-west-1"
    }
    let credentials = awsConfig.loadCredentials()
    if (credentials) {
        config.credentials = credentials;
    }
    console.log(credentials)
    const ecs = new AWS.ECS(config);

    function clusterInfo(clusterName) {
        logger.debug("Fetching cluster info for " + clusterName)
        return function (done) {
            done(null, {
                clusterName: clusterName,
                instances: []
            })
        }
    }

    function listContainerInstances(clusterInfo, done) {

        ecs.listContainerInstances({
            "cluster": clusterInfo.clusterName
        }, function (err, response) {
            if (err) {
                console.log(err, err.stack)
                done(err)
            } else {
                done(null, clusterInfo, response.containerInstanceArns)
            }
        })
    }

    function describeContainerInstances(clusterInfo, containerInstanceArns, done) {

        if (!containerInstanceArns || containerInstanceArns.length == 0) {
            return done(`No instances found in cluster ${clusterInfo.clusterName}.`)
        }

        ecs.describeContainerInstances({
            "cluster": clusterInfo.clusterName,
            "containerInstances": containerInstanceArns
        }, function (err, response) {
            if (err) {
                console.log(err, err.stack)
                done(err)
            } else {

                clusterInfo.instances = response.containerInstances.map(function (item) {
                    let containerInstanceArn = item.containerInstanceArn;
                    let status = item.status.toLowerCase();
                    let memory = item.registeredResources.find(res => res.name == "MEMORY").integerValue
                    let freeMemory = item.remainingResources.find(res => res.name == "MEMORY").integerValue
                    let zone = item.attributes.find(att => att.name == "ecs.availability-zone").value

                    return {
                        containerInstanceArn,
                        status,
                        memory,
                        freeMemory,
                        zone
                    }

                })
                done(null, clusterInfo)
            }

        })
    }

    function logIt(data, done) {
        console.log(JSON.stringify(data));
        done()
    }

    function getListOfTasks(clusterInfo, done) {

        ecs.listTasks({
            "cluster": clusterInfo.clusterName
        }, function (err, response) {
            if (err) {
                console.log(err, err.stack)
                done(err);
            } else {
                done(null, clusterInfo, response.taskArns);
            }
        })
    }

    function describeTasks(clusterInfo, taskArns, done) {

        if (!taskArns || taskArns.length == 0) {
            return done(`No tasks found in cluster ${clusterInfo.clusterName}.`)
        }

        ecs.describeTasks({
            "cluster": clusterInfo.clusterName,
            "tasks": taskArns
        }, function (err, response) {
            if (err) {
                console.log(err, err.stack)
                done(err);
            } else {

                let tasks = response.tasks.map(function (task) {
                    let name = task.containers[0].name;
                    let status = task.lastStatus.toLowerCase();
                    let containerInstanceArn = task.containerInstanceArn
                    return {
                        name,
                        status,
                        containerInstanceArn
                    }
                })

                done(null, clusterInfo, tasks);
            }
        })
    }

    function amalgamateResults(clusterInfo, tasks, done) {
        //console.log(tasks)
        try {
            // build a map to correlate tasks with instances
            let instanceMap = tasks.reduce(function (map, task) {

                // create a copy of each task object
                let taskInfo = Object.assign(task);

                // does the map already have the container instance referred by the task ?
                // if not then create it
                if (!map.hasOwnProperty(taskInfo.containerInstanceArn)) {
                    //console.log("creating new entry for instance")
                    map[taskInfo.containerInstanceArn] = {
                        "services": {}
                    }
                }
                // does the item in the map have our task yet ?
                // if not then add it
                if (!map[taskInfo.containerInstanceArn].services.hasOwnProperty(taskInfo.name)) {
                    //console.log("creating new entry for service in instance")
                    taskInfo.count = 1;
                    map[taskInfo.containerInstanceArn].services[taskInfo.name] = taskInfo;
                } else {
                    console.log("we already have a service with this name on the same instance...")
                    // if we have come across this task before then update our counter
                    map[taskInfo.containerInstanceArn].services[taskInfo.name].count += 1;
                }


                return map;
            }, {})

            clusterInfo.instances = Object.assign(clusterInfo.instances).map(function (instance) {

                // get the service data from our correlation map
                var serviceData = (instanceMap[instance.containerInstanceArn] || {}).services || {};
                instance.services = Object.keys(serviceData).map(function (key) {
                    return {
                        "name": serviceData[key].name,
                        "status": serviceData[key].status,
                        "count": serviceData[key].count
                    }
                })
                return instance;

            })

            done(null, clusterInfo);
        } catch (err) {
            done(err)
        }
    }


    that.updateClusterInfo = function (clusterName, callback) {
        async.waterfall([
            clusterInfo(clusterName),
            listContainerInstances,
            describeContainerInstances,
            getListOfTasks,
            describeTasks,
            amalgamateResults
        ], callback)
    };

    return {
        getClusterInfo: function (clusterName, done) {
            logger.info("pulling cluster info for " + clusterName)
            that.updateClusterInfo(clusterName,
                function (err, clusterInfo) {
                    if (err) {
                        logger.warn('Error while processing cluster data', err.message, err.stack);
                        done(err);
                    } else {
                        logger.info('All cluster info has been processed');
                        console.log(JSON.stringify(clusterInfo))
                        done(null, clusterInfo);
                    }
                }
            );
        },
        getAvailabileClusters: function (done) {
            ecs.listClusters({}, function (err, clusters) {
                if (err) {
                    done(err);
                    console.log(err, err.stack);
                } else {
                    done(null, clusters.clusterArns.map(clusterArn => clusterArn.split("/")[1]));
                }
            })

        }
    };

}();

module.exports = doReadClusterInfo;