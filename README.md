# LM Core Tool

An extension for interacting with LogicMonitor's Core Tools.

## Features

*   **Configuration Management:** Manage LogicMonitor API credentials (`creds.json`), active portal, and active device.
*   **Display Collectors:** View a list of collectors for the active portal.
*   **Pull LogicModules:** Pull LogicModules from a LogicMonitor account directly within VS Code.
*   **Push LogicModules:** Push local LogicModule changes to a LogicMonitor account.

## Requirements

*   None. This extension is self-contained.

## Authentication

This extension uses a `creds.json` file in the root of your workspace to authenticate with the LogicMonitor API. The credentials are LMv1 tokens.

1.  Create a `creds.json` file in the root of your workspace.
2.  Use the `creds.json.example` file as a template.
3.  Add your LogicMonitor portals to the `creds.json` file.

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

## Known Issues

There are no known issues at this time.

## Release Notes

### 0.1.0

Initial release of the LM Core Tool extension.

*   Implemented side bar UI for credential and device management.
*   Added basic commands for Pull and Push LogicModules.
*   Implemented direct API calls for LogicMonitor interaction, removing external dependencies.
