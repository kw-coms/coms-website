FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /app

COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle

RUN chmod +x ./gradlew

RUN ./gradlew --version --no-daemon

COPY src ./src

RUN ./gradlew clean test --tests com.coms.backend.MigrationVersionTest bootJar --no-daemon


FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

RUN apk add --no-cache su-exec && \
    addgroup -S spring && adduser -S spring -G spring

COPY --from=build /app/build/libs/*.jar app.jar
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/data /app/uploads && chown -R spring:spring /app/data

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
