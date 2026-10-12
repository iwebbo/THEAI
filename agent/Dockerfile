FROM golang:1.24-alpine AS build
WORKDIR /src

ARG VERSION=dev
ARG TARGETS="linux/amd64 linux/arm64 linux/arm linux/ppc64le windows/amd64 windows/arm64 aix/ppc64 freebsd/amd64 solaris/amd64 darwin/amd64 darwin/arm64"

COPY go.mod ./
COPY *.go ./
COPY build.sh ./
RUN VERSION="$VERSION" TARGETS="$TARGETS" sh ./build.sh /dist
COPY install/ /dist/

FROM alpine:3.20
COPY --from=build /dist /dist

CMD ["sh", "-c", "cp -f /dist/* /out/ && ls -l /out"]
