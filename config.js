const config = {};

config.enable_basic_auth = process.env.ENABLE_BASIC_AUTH || true;
config.basic_auth_user = process.env.BASIC_AUTH_USER || "ecs";
config.basic_auth_password = process.env.BASIC_AUTH_PASSWORD || "cluster";

config.log_level = process.env.LOG_LEVEL || "info";

config.server_timeout_seconds = process.env.SERVER_TIMEOUT_SECONDS || 10000;

module.exports = config;
