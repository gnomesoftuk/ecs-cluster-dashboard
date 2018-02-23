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
            return done({ "message": `No instances found in cluster ${clusterInfo.clusterName}.` })
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
            return done({ "message": `No tasks found in cluster ${clusterInfo.clusterName}.` })
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
            let dataMap = tasks.reduce(function (map, task) {

                // create a copy of each task object
                let taskInfo = Object.assign(task);
                // does the map already have the container instance referred by the task ?
                // if not then create it
                if (!map.hasOwnProperty(taskInfo.containerInstanceArn)) {
                    //console.log("creating new entry for instance")

                    // find the zone info for the cluster
                    let instance = clusterInfo.instances.find(instance => instance.containerInstanceArn == taskInfo.containerInstanceArn)
                    let zone = instance.zone;

                    map[taskInfo.containerInstanceArn] = {
                        "zone": zone,
                    }

                    // does the map already have the zone referenced by the instance ?
                    // if not then add it

                    
                    if (!map.hasOwnProperty(zone)) {
                        //console.log("creating new entry for instance")

                        // let the zone be it's own key so we can aggregate services against it
                        map[zone] = {
                            "services": {},
                            "count": 1
                        }
                        map.zones.push(zone)

                    } else {
                        // we have not visited this instance before but the zone is belongs to
                        // has been visited so we can update our instance counter.
                        map[zone].count += 1;
                    }
                }


                let zone = map[taskInfo.containerInstanceArn].zone;
                // does the zone in the map have our task yet ?
                // if not then add it
                if (!map[zone].services.hasOwnProperty(taskInfo.name)) {
                    //console.log("creating new entry for service in instance")
                    taskInfo.count = 1;
                    map[zone].services[taskInfo.name] = taskInfo;
                } else {
                    console.log("we already have a service with this name on the same instance...")
                    // if we have visited this task before then update our taskcounter
                    map[zone].services[taskInfo.name].count += 1;
                }


                return map;
            }, { "zones": [] })

            // logger.info("dataMap")
            // logger.info(dataMap)

            clusterInfo.zones = dataMap.zones.map(zoneId => {
                return {
                    "name": zoneId,
                    "status": "active",
                    "count": dataMap[zoneId].count,
                    "services": dataMap[zoneId].services
                }
            });
            delete clusterInfo.instances

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
                        logger.warn('Error while processing cluster data ', err.message, err.stack);
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