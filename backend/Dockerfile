FROM eclipse-temurin:21-jdk AS build

WORKDIR /app

COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle

RUN chmod +x ./gradlew

COPY src ./src

RUN ./gradlew clean bootJar -x test --no-daemon


FROM eclipse-temurin:21-jre

WORKDIR /app

COPY --from=build /app/build/libs/*.jar app.jar

RUN mkdir -p /app/data

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
