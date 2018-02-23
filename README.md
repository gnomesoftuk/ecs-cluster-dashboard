
# ECS Cluster Dashboard

This application allows easy viewing of the current state of ECS clusters deployed into AWS.

Choose the cluster you want to see and you will get a dashboard showing the zones it is deployed into and the tasks deployed
into each zone.

This is useful for a quick look at the health of the cluster and whether any particular services are not well balanced across
zones which could impact availability if that zone or instance fails.

## Installation
This project is written in node.js
Clone the project and make sure all node dependencies are installed.
Edit the config.js file and update the required variables.


## Usage

If you want to run this application locally then you will need to create an IAM user in the AWS account you want to monitor,
download the credentials.csv and transform it into a json file. Put it in the root of the application before you start it.

Alternatively deploy into the same AWS account and ensure the instance has an IAM role assigned with read only permissions to ECS.

### Running from commandline
```
npm start 
```

### Running using Docker

You can build the image locally by running `docker build -t gnomesoft/ecs-cluster-dashboard .`.

To run the dasboard run `docker run -it --rm -p 8080:8080 gnomesoft/ecs-cluster-dashboard`

### Config

You can edit the configuration via the config.js such as the authentication details. I recommend that you set up firewall rules if deploying into AWS and lock them down to your IP address.