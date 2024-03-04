# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

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
