# LM Core Tool

An extension for interacting with LogicMonitor's Core Tools.

## Features

* **Execute Scripts:** (Completed) Develop a collection, discovery, or netscan script and execute it right from VSCode.
* **Pull LogicModules:** (In Progress) Pull LogicModules from a LogicMonitor account directly within VS Code.
* **Push LogicModules:** (Future) Push local LogicModule changes to a LogicMonitor account.

## Requirements

* None. This extension is self-contained.

## Usage

### Authentication

This extension uses a `creds.json` file in the root of your workspace to authenticate with the LogicMonitor API. The credentials are LMv1 tokens.

1. Create a `creds.json` file in the root of your workspace or anywhere on your workstation.
2. Use the `creds.json.example` file as a template.
3. Add your LogicMonitor portal(s) to the `creds.json` file.

**Example `creds.json`:**

```json
{
    "prod": {
        "API_ACCESS_ID": "YOUR_API_ACCESS_ID",
        "API_ACCESS_KEY": "YOUR_API_ACCESS_KEY",
        "COMPANY_NAME": "portal1"
    },
    "sandbox": {
        "API_ACCESS_ID": "YOUR_API_ACCESS_ID",
        "API_ACCESS_KEY": "YOUR_API_ACCESS_KEY",
        "COMPANY_NAME": "portal2"
    }
}
```

Open the extension and use the Settings view to browse to your creds file.

### Selecting a Device

In the collector debug console, you could select the device against which the task would be executed. This simply means making the hosts properties available to the task so that methods like hostProps.get() would populate with real values. The extension allows you to do this by offering the Navigation view. This view displays all portals configured in your creds file and allows you to expand the tree to navigate to a device. Upon selecting a device, the "Current Selections" view shows which portal, collector, and device will be involved in script execution.

### Running a Script

There is a new play button for any script being edited (even unsaved) that has the Powershell or Groovy language specified. Clicking the play button will execute the script and show the script output in the Output channel.

## Known Issues

There are no known issues at this time.

## Release Notes

### 0.1.0

Initial release of the LM Core Tool extension.

* Implemented side bar UI for credential and device management.
* Implemented current selections view.
* Implemented resource tree to make selections.
* Implemented script running (needs further testing)
