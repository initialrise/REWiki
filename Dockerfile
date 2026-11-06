# syntax=docker/dockerfile:1
# Build the MkDocs site. Usage:
#   docker build -t aire-wiki .
#   docker run --rm -v "$PWD/site:/out" aire-wiki cp -r /docs/site/. /out/
FROM squidfunk/mkdocs-material:9.7.5

WORKDIR /docs
COPY mkdocs.yml ./
COPY docs ./docs

RUN mkdocs build
