# Change Log

All notable changes to the "simple-notebook-omnikernel" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## Changelog

### 0.1.2

Added `{{auth:github}}` as a token that expands to contain a github access token

### 0.1.3

Added `{{cell:TITLE}}` as a token that expands to reference an existing cell by header name.

This token will be substituted with the combined contents of all code cells immediately following all markdown cells containing `# TITLE`.

Added support for passing an object to be used as the execution environment via the dispatch config.