# VS Code LogicMonitor Extension: Development Plan

This document outlines the plan for creating a Visual Studio Code extension to streamline LogicModule development.

## 1. Project Goal

The primary goal is to build a VS Code extension that provides a seamless, integrated experience for interacting with LogicMonitor, focusing on module development and management.

## 2. Core Features

The extension will focus on the following main features:

1. **Execute Scripts:** Execute scripts as they are developed using a single click button to send the task to the collector and fetch the result. This takes the collector debug console out of the workflow for developing discovery and collection scripts.
2. **Pull LogicModules:** Integrate a command to allow users to pull LogicModule definition files from a LogicMonitor account directly within VS Code including separate scripts for discovery and collection.
3. **Push LogicModules:** Integrate a command to allow users to push local LogicModule changes to a LogicMonitor account.

## 3. Development Strategy

The extension will directly interact with the LogicMonitor REST API using TypeScript, eliminating the need for external scripts or the collector debug console. This approach makes the extension entirely self-contained and simplifies its prerequisites.

## 4. Implementation Plan

### Completed

- Used the `yo code` generator to create the basic file and directory structure for a new VS Code extension.
- Settings view added: allows selection of the creds file and toggling of debug logging.
- Navigation view added: Populates portal >> collector group >> collector >> device tree, referred to as the "resource tree".
- Current Selections view added: Shows currently selected portal, collector, and device (based on the device selected in the resource tree).
- Added play button on current tab that uses the /debug API endpoint to submit the currently active script for execution on the collector, poll for results.
- Added Modules view with population of remote modules tree

### In Progress

- Add to the Modules view: make a button on each module that downloads the module and scripts to the current directory in a subdirectory with the name of the module.

### To Be Done

- Add to the Modules view: make .*Source refresh button that refreshes the remote list.
