#!/bin/sh
mkdir -p /app/uploads
chown -R spring:spring /app/uploads
exec su-exec spring java -jar /app/app.jar
