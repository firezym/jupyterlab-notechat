# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 1.1.2 2024 Nov 20

- update readme

## 1.1.1 2024 Nov 20

- add github repo link to help menu

## 1.1.0 2024 Nov 19

- change demo gif to mp4 video

## 1.0.3 2024 Nov 19

- demo gif to lower resolution for pypi website

## 1.0.2 2024 Nov 19

- automatic pypi release

## 1.0.0 2024 Nov 19

- add o1 model support by specifying several parameters:
  - 1. no system message;
  - 2. temperature only accepts 1.0;
  - 3. max_tokens field -> max_completion_tokens
- change logging file handler from TimedRotatingFileHandler to ConcurrentRotatingFileHandler
- add en/zh language support for help menu
- add readme for github and pypi
- add gif demo in readme

## 0.3.3 2024 May 15

- trivial: update default model to gpt-4o

## 0.3.2 2024 May 6

- trivial: optimize package dependency, help and examples

## 0.3.1 2024 Apr 22

- new feature: support kimi moonshot models such as `@model moonshot-v1-32k` (8k & 128k also supported)
- set moonshot as default model: Top Menu Bar -> Settings -> Settings Editor -> NoteChat -> Param `@model` set as `moonshot-v1-32k` (8k & 128k also supported)
- 2 ways to setup api keys (methods also apply to `OPENAI_API_KEY`): 1. Top Menu Bar -> Settings -> Settings Editor -> NoteChat -> Param `@moonshot_api_key` set as `your_key`; 2. set key to server environment variable `MOONSHOT_API_KEY`, linux `export MOONSHOT_API_KEY=your_key`, windows `$env:MOONSHOT_API_KEY = "your_key"`
- trivial: update examples

## 0.3.0 2024 Apr 17

- add major function: notechat now can cross reference external files using `@files file_path/file_name` commands
- fix bug: change vision parameter `'image_url':'URL'` under model gpt-4-vision-preview to `'image_url': {'url': 'URL'}` under new model gpt-4-turbo
- optimize: chat logs will be stored daily under `@log` folder

## 0.2.0 2024 Mar 4

- fix major bug: jupyterlab 4.1.2 fixed the markdown broken copy/paste issue on chrome based browser in windows; but this version update brings the following bug
- fix bug: chat status icon on button can not rotate; icon class tag is missing under jupyterlab 4.1.2; use another feature to select icon
- trivial: update examples and new models

## 0.1.6 2024 Jan 30

- update default models to newest gpt-4-turbo-preview
- trivial: remove some console logging

## 0.1.5 2024 Jan 30

- fix major bug: use base64 encoding on frontend and decoding on backend to execute python code for refs; this can avoid kernel execution failure due to special chars in strings which should be escaped (such as ' inside "")
- optimize examples

## 0.1.3 2024 Jan 15

- fix major bug: num_prev_cell param usage
- optimize help notification close button
- improve documentation

## 0.1.2 2024 Jan 12

- optimize documents
- add help notification slidebar css

## 0.1.1 2024 Jan 11

- add notebook level parameter setting
- optimize help and settings display
- add full readme handbook and examples

## 0.1.0 2024 Jan 9

- fix build python package error

<!-- <END NEW CHANGELOG ENTRY> -->
