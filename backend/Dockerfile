FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /app

COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle

RUN chmod +x ./gradlew

RUN --mount=type=cache,id=coms-backend-gradle,target=/root/.gradle,sharing=locked \
    for attempt in 1 2 3; do \
      if ./gradlew --version --no-daemon; then exit 0; fi; \
      sleep $((attempt * 5)); \
    done; \
    exit 1

COPY src ./src

RUN --mount=type=cache,id=coms-backend-gradle,target=/root/.gradle,sharing=locked \
    ./gradlew clean test --tests com.coms.backend.MigrationVersionTest bootJar --no-daemon


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
