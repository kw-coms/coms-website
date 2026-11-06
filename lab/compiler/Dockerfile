# syntax=docker/dockerfile:1
# REQUIRED BEFORE BUILD: resolve the multi-platform index digest using
# docker buildx imagetools inspect node:22-bookworm-slim
# Registry DNS is unavailable in the hardening environment; fail closed until pinned.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
FROM ${NODE_IMAGE} AS toolchain
ARG TARGETARCH
ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
    ARDUINO_DIRECTORIES_DOWNLOADS=/tmp/arduino-downloads \
    ARDUINO_BUILD_CACHE_PATH=/tmp/arduino-cache \
    ARDUINO_UPDATER_ENABLE_NOTIFICATION=false
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl bzip2 xz-utils \
    && rm -rf /var/lib/apt/lists/*
# Checksums are pinned here, not fetched from the same mutable build response.
# https://github.com/arduino/arduino-cli/releases/tag/v1.5.1
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) archive=Linux_64bit; sha=28a8e119c498a25607821c36cb2dc49e8463941b261a0d99091baa7bc692dd2b ;; \
      arm64) archive=Linux_ARM64; sha=1e69e077479f300614d4551334e0a33f08ee40b04315d83b8e7e0e94f0d0ee62 ;; \
      *) echo 'Only linux/amd64 and linux/arm64 are supported' >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/arduino/arduino-cli/releases/download/v1.5.1/arduino-cli_1.5.1_${archive}.tar.gz" -o /tmp/cli.tar.gz; \
    echo "$sha  /tmp/cli.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/cli.tar.gz -C /usr/local/bin arduino-cli; \
    rm /tmp/cli.tar.gz
RUN arduino-cli core update-index \
    && arduino-cli core install arduino:avr@1.8.8 \
    && arduino-cli lib update-index \
    && arduino-cli lib install --no-deps \
      'Servo@1.2.2' \
      'LiquidCrystal I2C@1.1.2' \
      'Adafruit Unified Sensor@1.1.15' \
      'DHT sensor library@1.4.6' \
      'Adafruit NeoPixel@1.12.5' \
    && chmod -R a+rX /opt/arduino

FROM ${NODE_IMAGE}
# Offline compiler: no runtime download client or OS CA bundle is needed.
# Optional Node fetch authentication uses Node's bundled root certificates.
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 util-linux \
    && rm -rf /var/lib/apt/lists/* /opt/yarn* /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && groupadd --gid 10001 compiler && useradd --uid 10001 --gid compiler --no-create-home --shell /usr/sbin/nologin compiler
ENV NODE_ENV=production PORT=8787 HOME=/tmp \
    ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
    ARDUINO_DIRECTORIES_DOWNLOADS=/tmp/arduino-downloads \
    ARDUINO_BUILD_CACHE_PATH=/tmp/arduino-cache \
    ARDUINO_UPDATER_ENABLE_NOTIFICATION=false
COPY --from=toolchain /usr/local/bin/arduino-cli /usr/local/bin/arduino-cli
COPY --from=toolchain /opt/arduino /opt/arduino
COPY --chmod=755 avr-limited.sh /usr/local/libexec/avr-limited
RUN set -eu; \
    set -- /opt/arduino/data/packages/arduino/tools/avr-gcc/*; \
    test "$#" -eq 1; test -x "$1/bin/avr-g++"; \
    ln -s "$1" /opt/avr-toolchain; \
    mkdir -p /opt/avr-limited/bin; \
    for tool in avr-gcc avr-g++ avr-gcc-ar avr-ar avr-objcopy avr-size; do \
      test -x "/opt/avr-toolchain/bin/$tool"; \
      ln -s /usr/local/libexec/avr-limited "/opt/avr-limited/bin/$tool"; \
    done; \
    /usr/bin/prlimit --version
WORKDIR /app
COPY --chown=root:root server.mjs compile.mjs validation.mjs limits.mjs diagnostics.mjs package.json ./
USER compiler
# Fail the image build if the dedicated runtime user can read password hashes.
RUN test ! -r /etc/shadow
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "const {request}=await import('node:http'); const socket=process.env.LISTEN_SOCKET; const r=request(socket?{socketPath:socket,path:'/lab/api/health',timeout:2500}:{host:'127.0.0.1',port:process.env.PORT||8787,path:'/lab/api/health',timeout:2500},res=>{res.resume();process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.on('timeout',()=>r.destroy());r.end()"]
CMD ["node", "server.mjs"]
