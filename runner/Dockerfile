# syntax=docker/dockerfile:1
# Base images are pinned by digest. Bookworm apt does not supply JDK 21 or Python 3.12, so those
# runtimes are copied from separately pinned vendor images; never mix newer Debian suites into Bookworm.
FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df AS python-runtime
FROM eclipse-temurin:21-jdk-jammy@sha256:4b1a74fbffbe6b4e7b6f0171a472478282fb463790a51edf10e465d578f22b69 AS java-runtime
FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d

RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc libc6-dev util-linux tini libstdc++6 libzstd1 libssl3 libsqlite3-0 \
      zlib1g libbz2-1.0 liblzma5 libreadline8 libffi8 libexpat1 \
      libuuid1 libcrypt1 libncursesw6 libtinfo6 \
    && mkdir -p /opt/runner /run/coms-study /jobs /var/lib/coms-study \
    && chmod 0700 /var/lib/coms-study \
    && groupadd --gid 10100 jobrunner \
    && useradd --uid 10100 --gid 10100 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin jobrunner \
    && dpkg-query -W -f='${Package}=${Version}\n' \
      > /opt/runner/apt-versions.txt \
    # Nothing in this image needs a setuid/setgid binary (jobs run with no_new_privs anyway).
    && find / -xdev -type f -perm /6000 -delete \
    && rm -rf /var/lib/apt/lists/* /opt/yarn* /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=python-runtime /usr/local /usr/local
COPY --from=java-runtime /opt/java/openjdk /opt/java/openjdk
RUN ldconfig \
    && ln -s /opt/java/openjdk/bin/java /usr/local/bin/java \
    && ln -s /opt/java/openjdk/bin/javac /usr/local/bin/javac \
    && gcc --version >/dev/null && python3 --version | grep '^Python 3\.12\.' \
    && java -version 2>&1 | grep '21\.' && javac -version 2>&1 | grep '^javac 21\.' \
    && /usr/bin/prlimit --version >/dev/null && /usr/bin/setpriv --version >/dev/null && /usr/bin/env -C / true
ENV NODE_ENV=production RUNNER_CONTAINER=1 PORT=8788 \
    PATH=/usr/local/bin:/usr/bin:/bin JAVA_HOME=/opt/java/openjdk
WORKDIR /app
COPY --chown=root:root *.mjs package.json ./
# test/ stays in the image on purpose: the toolchain/attack suite runs inside this exact image.
COPY --chown=root:root test ./test
# No USER: the server starts as container-root and the compose/run flags leave it only
# SETUID, SETGID and KILL. Every job is exec'd through setpriv as uid/gid 10100.
RUN setpriv --reuid=10100 --regid=10100 --clear-groups sh -c 'test ! -r /etc/shadow'
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD ["node", "--input-type=module", "-e", "const {request}=await import('node:http');const socket=process.env.LISTEN_SOCKET;const r=request(socket?{socketPath:socket,path:'/study/api/health',timeout:2500}:{host:'127.0.0.1',port:process.env.PORT||8788,path:'/study/api/health',timeout:2500},res=>{res.resume();process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.on('timeout',()=>r.destroy());r.end()"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
