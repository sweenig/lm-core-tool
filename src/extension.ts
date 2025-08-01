import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto'; // For HMAC-SHA256

interface Portal {
    API_ACCESS_ID: string;
    API_ACCESS_KEY: string;
    COMPANY_NAME: string;
}

interface CollectorGroup {
    id: number;
    name: string;
}

interface Collector {
    id: number;
    description: string;
    collectorGroupId: number;
}

interface Device {
    id: number;
    name: string; // hostname
    displayName: string;
}

interface DataSource {
    id: number;
    name: string;
    displayName: string;
}

interface PropertySource {
    id: number;
    name: string;
}

interface EventSource {
    id: number;
    name: string;
}

interface ConfigSource {
    id: number;
    name: string;
}

interface TopologySource {
    id: number;
    name: string;
}

interface LogSource {
    id: number;
    name: string;
}

interface SysOidMap {
    id: number;
    oid: string;
}

interface AppliesToFunction {
    id: number;
    name: string;
}

interface Manifest {
    name: string;
    displayName: string;
    id: string;
    portal: string;
    moduleType: string;
    pullDate: string;
}

async function getCredentials(context: vscode.ExtensionContext): Promise<[string, Portal][] | undefined> {
    const credsPath = context.workspaceState.get<string>('logicmonitor.credentialsPath');
    if (!credsPath) {
        vscode.window.showErrorMessage("Path to creds.json not set. Please set it in the LogicMonitor side bar.");
        return;
    }

    try {
        const credsContent = fs.readFileSync(credsPath, 'utf-8');
        const creds = JSON.parse(credsContent);
        return Object.entries(creds);
    } catch (error) {
        vscode.window.showErrorMessage("Error reading or parsing creds.json. Please make sure it exists and is correctly formatted.");
        return;
    }
}

function generateLMv1AuthHeader(apiId: string, apiKey: string, httpVerb: string, resourcePath: string, epoch: string, data: string = ''): string {
    const signature = Buffer.from(
        crypto.createHmac('sha256', apiKey)
            .update(httpVerb + epoch + data + resourcePath)
            .digest('hex')
    ).toString('base64');

    return `LMv1 ${apiId}:${signature}:${epoch}`;
}

async function makeApiRequest(
    context: vscode.ExtensionContext, // Added context parameter
    outputChannel: vscode.OutputChannel,
    portalDetails: Portal,
    httpVerb: string,
    resourcePath: string,
    data: any = null,
    queryParams: { [key: string]: string } = {}
): Promise<any> {
    const debugEnabled = context.workspaceState.get<boolean>('logicmonitor.debugEnabled', false);
    const epoch = String(Date.now());
    const requestData = data ? JSON.stringify(data) : '';
    const authHeader = generateLMv1AuthHeader(
        portalDetails.API_ACCESS_ID,
        portalDetails.API_ACCESS_KEY,
        httpVerb,
        resourcePath,
        epoch,
        requestData
    );

    let url = `https://${portalDetails.COMPANY_NAME}.logicmonitor.com/santaba/rest${resourcePath}`;

    if (Object.keys(queryParams).length > 0) {
        const queryString = new URLSearchParams(queryParams).toString();
        url = `${url}?${queryString}`;
    }

    const headers: { [key: string]: string } = {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'X-version': '3', // Using V3 API
        'Accept': 'application/json' // Explicitly set Accept header
    };

    if (debugEnabled) {
        outputChannel.appendLine(`Making API request:`);
        outputChannel.appendLine(`  URL: ${url}`);
        outputChannel.appendLine(`  Method: ${httpVerb}`);
        if (data) {
            outputChannel.appendLine(`  Body: ${requestData}`);
        }
        outputChannel.show(true); // Focus the output channel
    }

    const options: RequestInit = {
        method: httpVerb,
        headers: headers,
    };

    if (data) {
        options.body = requestData;
    }

    try {
        const response = await fetch(url, options);
        const responseJson = await response.json(); // Parse JSON once

        if (debugEnabled) {
            // Log the response details
            outputChannel.appendLine(`API Response:`);
            outputChannel.appendLine(`  Status: ${response.status} ${response.statusText}`);
            if (typeof responseJson === 'object' && responseJson !== null && 'items' in responseJson && Array.isArray(responseJson.items)) { // Check if 'items' exists and is an array
                outputChannel.appendLine(`  Items fetched: ${responseJson.items.length}`);
            } else {
                outputChannel.appendLine(`  Body: ${JSON.stringify(responseJson, null, 2)}`); // Fallback for non-item responses
            }
        }

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${JSON.stringify(responseJson)}`);
        }
        return responseJson;
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to make API request: ${error.message}`);
        throw error;
    }
}

async function getCollectorGroups(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<CollectorGroup[]> {
    let allGroups: CollectorGroup[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/collector/groups', null, { size: String(size), offset: String(offset), fields: 'id,name' });
            if (response && response.items) {
                allGroups = allGroups.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allGroups;
    } catch (error) {
        console.error("Error fetching collector groups:", error);
        return [];
    }
}

async function getCollectors(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<Collector[]> {
    let allCollectors: Collector[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/collector/collectors', null, { size: String(size), offset: String(offset), fields: 'id,description,collectorGroupId' });
            if (response && response.items) {
                allCollectors = allCollectors.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allCollectors;
    } catch (error) {
        console.error("Error fetching collectors:", error);
        return [];
    }
}

async function getDevices(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal, collectorId: number): Promise<Device[]> {
    let allDevices: Device[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/device/devices', null, { size: String(size), offset: String(offset), fields: 'id,name,displayName', filter: `preferredCollectorId:${collectorId}` });
            if (response && response.items) {
                allDevices = allDevices.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allDevices.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
        console.error(`Error fetching devices for collector ${collectorId}:`, error);
        return [];
    }
}

async function getRemoteDataSources(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<DataSource[]> {
    let allDataSources: DataSource[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/datasources', null, { size: String(size), offset: String(offset), fields: 'id,name,displayName' });
            if (response && response.items) {
                allDataSources = allDataSources.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allDataSources.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
        console.error("Error fetching remote DataSources:", error);
        return [];
    }
}

async function getRemotePropertySources(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<PropertySource[]> {
    let allPropertySources: PropertySource[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/propertyrules', null, { size: String(size), offset: String(offset), fields: 'id,name' });
            if (response && response.items) {
                allPropertySources = allPropertySources.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allPropertySources.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error fetching remote PropertySources:", error);
        return [];
    }
}

async function getRemoteEventSources(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<EventSource[]> {
    let allEventSources: EventSource[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/eventsources', null, { size: String(size), offset: String(offset), fields: 'id,name' });
            if (response && response.items) {
                allEventSources = allEventSources.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allEventSources.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error fetching remote EventSources:", error);
        return [];
    }
}

async function getRemoteConfigSources(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<ConfigSource[]> {
    let allConfigSources: ConfigSource[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/configsources', null, { size: String(size), offset: String(offset), fields: 'id,name' });
            if (response && response.items) {
                allConfigSources = allConfigSources.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allConfigSources.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error fetching remote ConfigSources:", error);
        return [];
    }
}

async function getRemoteTopologySources(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<TopologySource[]> {
    let allTopologySources: TopologySource[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/topologysources', null, { size: String(size), offset: String(offset), fields: 'id,name' });
            if (response && response.items) {
                allTopologySources = allTopologySources.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allTopologySources.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error fetching remote TopologySources:", error);
        return [];
    }
}

async function getRemoteLogSources(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<LogSource[]> {
    let allLogSources: LogSource[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/logsources', null, { size: String(size), offset: String(offset), fields: 'id,name' });
            if (response && response.items) {
                allLogSources = allLogSources.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allLogSources.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error fetching remote LogSources:", error);
        return [];
    }
}

async function getRemoteSysOidMaps(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<SysOidMap[]> {
    let allSysOidMaps: SysOidMap[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/oids', null, { size: String(size), offset: String(offset), fields: 'id,oid' });
            if (response && response.items) {
                allSysOidMaps = allSysOidMaps.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allSysOidMaps.sort((a, b) => a.oid.localeCompare(b.oid));
    } catch (error) {
        console.error("Error fetching remote SysOidMaps:", error);
        return [];
    }
}

async function getRemoteAppliesToFunctions(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, portalDetails: Portal): Promise<AppliesToFunction[]> {
    let allAppliesToFunctions: AppliesToFunction[] = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', '/setting/functions', null, { size: String(size), offset: String(offset), fields: 'id,name' });
            if (response && response.items) {
                allAppliesToFunctions = allAppliesToFunctions.concat(response.items);
                if (response.items.length < size) {
                    hasMore = false;
                } else {
                    offset += size;
                }
            } else {
                hasMore = false;
            }
        }
        return allAppliesToFunctions.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error fetching remote AppliesToFunctions:", error);
        return [];
    }
}

// New TreeDataProvider for Settings
class SettingsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        const credsPath = this.context.workspaceState.get<string>('logicmonitor.credentialsPath');
        if (element) {
            return Promise.resolve([]);
        } else {
            const credsItem = new vscode.TreeItem('Credentials', vscode.TreeItemCollapsibleState.None);
            if (credsPath) {
                credsItem.label = `Current Credentials: ${path.basename(credsPath)}`;
                credsItem.description = credsPath;
                credsItem.iconPath = new vscode.ThemeIcon('file-code');
            } else {
                credsItem.label = 'Credentials file not set';
                credsItem.description = 'Click to browse for creds.json';
                credsItem.iconPath = new vscode.ThemeIcon('warning');
            }
            credsItem.command = { command: 'logicmonitor.setCredentials', title: 'Set Credentials' };

            const debugEnabled = this.context.workspaceState.get<boolean>('logicmonitor.debugEnabled', false);
            const debugItem = new vscode.TreeItem('Debug', vscode.TreeItemCollapsibleState.None);
            debugItem.label = `Debug: ${debugEnabled ? 'On' : 'Off'}`;
            debugItem.iconPath = new vscode.ThemeIcon(debugEnabled ? 'check' : 'empty');
            debugItem.command = { command: 'logicmonitor.toggleDebug', title: 'Toggle Debug' };

            return Promise.resolve([credsItem, debugItem]);
        }
    }
}

// New TreeDataProvider for Current Selections
class CurrentSelectionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
            const activeCollectorId = this.context.workspaceState.get<number>('logicmonitor.activeCollectorId');
            const activeCollectorDescription = this.context.workspaceState.get<string>('logicmonitor.activeCollectorDescription');
            const activeDeviceId = this.context.workspaceState.get<number>('logicmonitor.activeDeviceId');
            const activeDeviceDisplayName = this.context.workspaceState.get<string>('logicmonitor.activeDeviceDisplayName');
            const activeDeviceHostname = this.context.workspaceState.get<string>('logicmonitor.activeDeviceHostname');

            const currentSelections: vscode.TreeItem[] = [];

            if (activePortalName) {
                currentSelections.push(new vscode.TreeItem(`Portal: ${activePortalName}`));
            }
            if (activeCollectorId) {
                currentSelections.push(new vscode.TreeItem(`Collector: ${activeCollectorDescription} (${activeCollectorId})`));
            }
            if (activeDeviceId && activeDeviceDisplayName && activeDeviceHostname) {
                currentSelections.push(new vscode.TreeItem(`Device: ${activeDeviceDisplayName} (${activeDeviceHostname}:${activeDeviceId})`));
            }
            return Promise.resolve(currentSelections);
        }
    }
}

// New TreeDataProvider for Navigation (Portals, Groups, Collectors, Devices)
class NavigationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) { } // Added outputChannel

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            // Handle expanding Portals, Collector Groups, and Collectors
            if (element.id === 'portals-root') { // New root for portals
                const portals = await getCredentials(this.context);
                if (portals) {
                    return portals.map(([name, _]) => {
                        const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.Collapsed);
                        item.id = `portal-${name}`;
                        return item;
                    });
                }
            } else if (element.id?.startsWith('portal-')) {
                const portalName = element.id.replace('portal-', '');
                const portals = await getCredentials(this.context);
                const selectedPortal = portals?.find(([name, _]) => name === portalName);
                if (selectedPortal) {
                    const [_, portalDetails] = selectedPortal;
                    const groups = await getCollectorGroups(this.context, this.outputChannel, portalDetails);
                    const collectors = await getCollectors(this.context, this.outputChannel, portalDetails);

                    const groupedCollectors: { [key: number]: Collector[] } = {};
                    const ungroupedCollectors: Collector[] = [];

                    collectors.forEach(collector => {
                        if (collector.collectorGroupId && groups.some(group => group.id === collector.collectorGroupId)) {
                            if (!groupedCollectors[collector.collectorGroupId]) {
                                groupedCollectors[collector.collectorGroupId] = [];
                            }
                            groupedCollectors[collector.collectorGroupId].push(collector);
                        } else {
                            ungroupedCollectors.push(collector);
                        }
                    });

                    const treeItems: vscode.TreeItem[] = [];

                    groups.forEach(group => {
                        const groupItem = new vscode.TreeItem(group.name, vscode.TreeItemCollapsibleState.Collapsed);
                        groupItem.id = `group-${group.id}`;
                        treeItems.push(groupItem);
                    });

                    if (ungroupedCollectors.length > 0) {
                        const ungroupedItem = new vscode.TreeItem('Ungrouped', vscode.TreeItemCollapsibleState.Collapsed);
                        ungroupedItem.id = 'group-ungrouped';
                        treeItems.push(ungroupedItem);
                    }
                    
                    // Store the grouped collectors for later retrieval by getChildren
                    this.context.workspaceState.update('logicmonitor.groupedCollectors', { groups, groupedCollectors, ungroupedCollectors });
                    this.context.workspaceState.update('logicmonitor.currentPortalDetails', portalDetails); // Store current portal details

                    return treeItems;
                }
            }
            else if (element.id?.startsWith('group-')) {
                const storedData = this.context.workspaceState.get<{ groups: CollectorGroup[], groupedCollectors: { [key: number]: Collector[] }, ungroupedCollectors: Collector[] }>('logicmonitor.groupedCollectors');
                if (storedData) {
                    const groupId = element.id.replace('group-', '');
                    if (groupId === 'ungrouped') {
                        return storedData.ungroupedCollectors.map(collector => {
                            const item = new vscode.TreeItem(`${collector.description} (${collector.id})`);
                            item.id = `collector-${collector.id}`;
                            item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed; // Make collectors collapsible
                            return item;
                        });
                    } else {
                        const collectorsInGroup = storedData.groupedCollectors[Number(groupId)];
                        if (collectorsInGroup) {
                            return collectorsInGroup.map(collector => {
                                const item = new vscode.TreeItem(`${collector.description} (${collector.id})`);
                                item.id = `collector-${collector.id}`;
                                item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed; // Make collectors collapsible
                                return item;
                            });
                        }
                    }
                }
                return Promise.resolve([]);
            } else if (element.id?.startsWith('collector-')) { // Handle expanding a collector
                const collectorId = Number(element.id.replace('collector-', ''));
                const portalDetails = this.context.workspaceState.get<Portal>('logicmonitor.currentPortalDetails'); // Retrieve current portal details
                if (portalDetails) {
                    // Get collector description from stored data
                    const storedData = this.context.workspaceState.get<{ groups: CollectorGroup[], groupedCollectors: { [key: number]: Collector[] }, ungroupedCollectors: Collector[] }>('logicmonitor.groupedCollectors');
                    let collectorDescription: string | undefined;
                    if (storedData) {
                        // Check grouped collectors
                        for (const groupId in storedData.groupedCollectors) {
                            const foundCollector = storedData.groupedCollectors[groupId].find(col => col.id === collectorId);
                            if (foundCollector) {
                                collectorDescription = foundCollector.description;
                                break;
                            }
                        }
                        // Check ungrouped collectors if not found in grouped
                        if (!collectorDescription) {
                            const foundCollector = storedData.ungroupedCollectors.find(col => col.id === collectorId);
                            if (foundCollector) {
                                collectorDescription = foundCollector.description;
                            }
                        }
                    }

                    const devices = await getDevices(this.context, this.outputChannel, portalDetails, collectorId);
                    return devices.map(device => {
                        const item = new vscode.TreeItem(`${device.displayName} (${device.name}:${device.id})`);
                        item.id = `device-${device.id}`;
                        item.command = { command: 'logicmonitor.setActiveDevice', title: 'Set Active Device', arguments: [portalDetails.COMPANY_NAME, collectorId, collectorDescription, device.id, device.displayName, device.name] };
                        return item;
                    });
                }
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        } else {
            // Top-level items for NavigationProvider
            const portalsRootItem = new vscode.TreeItem('Portals', vscode.TreeItemCollapsibleState.Collapsed);
            portalsRootItem.id = 'portals-root';
            return Promise.resolve([portalsRootItem]);
        }
    }
}

async function pollDebugSession(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    portalDetails: Portal,
    collectorId: number,
    sessionId: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    const maxAttempts = 40; // 2 minutes / 3 seconds per attempt = 40 attempts
    const delay = 3000; // 3 seconds
    const debugEnabled = context.workspaceState.get<boolean>('logicmonitor.debugEnabled', false);

    for (let i = 0; i < maxAttempts; i++) {
        progress.report({ message: `Awaiting completion... (${i + 1}/${maxAttempts})`, increment: 100 / maxAttempts });
        await new Promise(resolve => setTimeout(resolve, delay));

        const resourcePath = `/debug/${sessionId}`;
        const queryParams = {
            collectorId: String(collectorId),
            _: Date.now().toString() // Dummy parameter to prevent caching
        };

        try {
            const response = await makeApiRequest(context, outputChannel, portalDetails, 'GET', resourcePath, null, queryParams);
            if (debugEnabled) {
                outputChannel.appendLine(`\n--- Debug Session Poll (${i + 1}/${maxAttempts}) ---`);
                outputChannel.appendLine(JSON.stringify(response, null, 2));
                outputChannel.appendLine(`--- End Debug Session Poll ---`);
            }


            if (response && response.status === 'completed') { // Assuming a 'status' field indicates completion
                vscode.window.showInformationMessage('Debug session completed.');
                return;
            } else if (response && response.status === 'cancelled') {
                vscode.window.showErrorMessage('Debug session cancelled by collector.');
                return;
            } else if (response && response.output && typeof response.output === 'string' && response.output.includes('cancelled')) {
                vscode.window.showErrorMessage('Debug session output indicates cancellation.');
                return;
            } else if (response && response.output && typeof response.output === 'string' && response.output.startsWith('returns')) {
                const outputLines = response.output.split('\n');
                const firstLine = outputLines[0];
                const match = firstLine.match(/^returns\s+(-?\d+|null)/);
                let returnValue: string | null = null;
                if (match && match[1]) {
                    returnValue = match[1];
                }

                outputChannel.appendLine(`Script returned a value of ${returnValue}`);

                const remainingOutput = outputLines.slice(1).join('\n');
                // Replace \n with \r as requested. appendLine will add its own \n.
                outputChannel.appendLine(remainingOutput.replace(/\n/g, '\r'));

                vscode.window.showInformationMessage('Debug session completed with output.');
                return;
            }
        } catch (error: any) {
            if (debugEnabled) {
                outputChannel.appendLine(`
--- Debug Session Poll Error (${i + 1}/${maxAttempts}) ---`);
                outputChannel.appendLine(`Error: ${error.message}`);
                outputChannel.appendLine(`--- End Debug Session Poll Error ---`);
            }
            // Continue polling even on error, as it might be transient
        }
    }

    if (debugEnabled) {
        vscode.window.showWarningMessage('Debug session timed out after 2 minutes.');
    }
}

// New TreeDataProvider for Modules
class ModulesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            if (element.id === 'local-modules-root') {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    return Promise.resolve([]);
                }
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const lmCoreToolPath = path.join(workspaceRoot, 'coretool', 'lm');

                if (!fs.existsSync(lmCoreToolPath)) {
                    return Promise.resolve([new vscode.TreeItem('No local modules found in coretool/lm')]);
                }

                const moduleTypes: { [key: string]: vscode.TreeItem[] } = {};

                const dirents = fs.readdirSync(lmCoreToolPath, { withFileTypes: true });
                for (const dirent of dirents) {
                    if (dirent.isDirectory()) {
                        const modulePath = path.join(lmCoreToolPath, dirent.name);
                        const manifestPath = path.join(modulePath, 'manifest.json');
                        if (fs.existsSync(manifestPath)) {
                            try {
                                const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
                                const manifest: Manifest = JSON.parse(manifestContent);

                                if (!moduleTypes[manifest.moduleType]) {
                                    moduleTypes[manifest.moduleType] = [];
                                }
                                const item = new vscode.TreeItem(manifest.displayName || manifest.name, vscode.TreeItemCollapsibleState.None);
                                item.id = `local-module-${manifest.moduleType}-${manifest.id}`;
                                item.description = `Portal: ${manifest.portal} (Pulled: ${new Date(manifest.pullDate).toLocaleDateString()})`;
                                item.tooltip = `ID: ${manifest.id}\nPortal: ${manifest.portal}\nPulled: ${new Date(manifest.pullDate).toLocaleString()}`;
                                item.command = { command: 'logicmonitor.openLocalModule', title: 'Open Local Module', arguments: [modulePath] };
                                moduleTypes[manifest.moduleType].push(item);
                            } catch (error) {
                                console.error(`Error reading or parsing manifest.json for ${dirent.name}:`, error);
                                const item = new vscode.TreeItem(`${dirent.name} (Error loading manifest)`, vscode.TreeItemCollapsibleState.None);
                                item.id = `local-module-error-${dirent.name}`;
                                moduleTypes["Unknown"] = moduleTypes["Unknown"] || [];
                                moduleTypes["Unknown"].push(item);
                            }
                        } else {
                            const item = new vscode.TreeItem(`${dirent.name} (No manifest.json)`, vscode.TreeItemCollapsibleState.None);
                            item.id = `local-module-no-manifest-${dirent.name}`;
                            moduleTypes["Unknown"] = moduleTypes["Unknown"] || [];
                            moduleTypes["Unknown"].push(item);
                        }
                    }
                }

                const treeItems: vscode.TreeItem[] = [];
                for (const type in moduleTypes) {
                    const typeItem = new vscode.TreeItem(type, vscode.TreeItemCollapsibleState.Collapsed);
                    typeItem.id = `local-module-type-${type}`;
                    treeItems.push(typeItem);
                }
                return Promise.resolve(treeItems.sort((a, b) => a.label!.localeCompare(b.label!)));
            } else if (element.id?.startsWith('local-module-type-')) {
                const moduleType = element.id.replace('local-module-type-', '');
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    return Promise.resolve([]);
                }
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const lmCoreToolPath = path.join(workspaceRoot, 'coretool', 'lm');

                const modulesInType: vscode.TreeItem[] = [];
                const dirents = fs.readdirSync(lmCoreToolPath, { withFileTypes: true });
                for (const dirent of dirents) {
                    if (dirent.isDirectory()) {
                        const modulePath = path.join(lmCoreToolPath, dirent.name);
                        const manifestPath = path.join(modulePath, 'manifest.json');
                        if (fs.existsSync(manifestPath)) {
                            try {
                                const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
                                const manifest: Manifest = JSON.parse(manifestContent);
                                if (manifest.moduleType === moduleType) {
                                    const item = new vscode.TreeItem(manifest.displayName || manifest.name, vscode.TreeItemCollapsibleState.None);
                                    item.id = `local-module-${manifest.moduleType}-${manifest.id}`;
                                    item.description = `Portal: ${manifest.portal} (Pulled: ${new Date(manifest.pullDate).toLocaleDateString()})`;
                                    item.tooltip = `ID: ${manifest.id}\nPortal: ${manifest.portal}\nPulled: ${new Date(manifest.pullDate).toLocaleString()}`;
                                    item.command = { command: 'logicmonitor.openLocalModule', title: 'Open Local Module', arguments: [modulePath] };
                                    modulesInType.push(item);
                                }
                            } catch (error) {
                                console.error(`Error reading or parsing manifest.json for ${dirent.name}:`, error);
                            }
                        }
                    }
                }
                return Promise.resolve(modulesInType.sort((a, b) => a.label!.localeCompare(b.label!)));
            }
                const moduleTypes: { [key: string]: vscode.TreeItem[] } = {};

                const dirents = fs.readdirSync(lmCoreToolPath, { withFileTypes: true });
                for (const dirent of dirents) {
                    if (dirent.isDirectory()) {
                        const modulePath = path.join(lmCoreToolPath, dirent.name);
                        const manifestPath = path.join(modulePath, 'manifest.json');
                        if (fs.existsSync(manifestPath)) {
                            try {
                                const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
                                const manifest: Manifest = JSON.parse(manifestContent);

                                if (!moduleTypes[manifest.moduleType]) {
                                    moduleTypes[manifest.moduleType] = [];
                                }
                                const item = new vscode.TreeItem(manifest.displayName || manifest.name, vscode.TreeItemCollapsibleState.None);
                                item.id = `local-module-${manifest.moduleType}-${manifest.id}`;
                                item.description = `Portal: ${manifest.portal} (Pulled: ${new Date(manifest.pullDate).toLocaleDateString()})`;
                                item.tooltip = `ID: ${manifest.id}
Portal: ${manifest.portal}
Pulled: ${new Date(manifest.pullDate).toLocaleString()}`;
                                item.command = { command: 'logicmonitor.openLocalModule', title: 'Open Local Module', arguments: [modulePath] };
                                moduleTypes[manifest.moduleType].push(item);
                            } catch (error) {
                                console.error(`Error reading or parsing manifest.json for ${dirent.name}:`, error);
                                const item = new vscode.TreeItem(`${dirent.name} (Error loading manifest)`, vscode.TreeItemCollapsibleState.None);
                                item.id = `local-module-error-${dirent.name}`;
                                moduleTypes["Unknown"] = moduleTypes["Unknown"] || [];
                                moduleTypes["Unknown"].push(item);
                            }
                        } else {
                            const item = new vscode.TreeItem(`${dirent.name} (No manifest.json)`, vscode.TreeItemCollapsibleState.None);
                            item.id = `local-module-no-manifest-${dirent.name}`;
                            moduleTypes["Unknown"] = moduleTypes["Unknown"] || [];
                            moduleTypes["Unknown"].push(item);
                        }
                    }
                }

                const treeItems: vscode.TreeItem[] = [];
                for (const type in moduleTypes) {
                    const typeItem = new vscode.TreeItem(type, vscode.TreeItemCollapsibleState.Collapsed);
                    typeItem.id = `local-module-type-${type}`;
                    treeItems.push(typeItem);
                }
                return Promise.resolve(treeItems.sort((a, b) => (a.label as string).localeCompare(b.label as string)));
            } else if (element.id?.startsWith('local-module-type-')) {
                const moduleType = element.id.replace('local-module-type-', '');
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    return Promise.resolve([]);
                }
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const lmCoreToolPath = path.join(workspaceRoot, 'coretool', 'lm');

                const modulesInType: vscode.TreeItem[] = [];
                const dirents = fs.readdirSync(lmCoreToolPath, { withFileTypes: true });
                for (const dirent of dirents) {
                    if (dirent.isDirectory()) {
                        const modulePath = path.join(lmCoreToolPath, dirent.name);
                        const manifestPath = path.join(modulePath, 'manifest.json');
                        if (fs.existsSync(manifestPath)) {
                            try {
                                const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
                                const manifest: Manifest = JSON.parse(manifestContent);
                                if (manifest.moduleType === moduleType) {
                                    const item = new vscode.TreeItem(manifest.displayName || manifest.name, vscode.TreeItemCollapsibleState.None);
                                    item.id = `local-module-${manifest.moduleType}-${manifest.id}`;
                                    item.description = `Portal: ${manifest.portal} (Pulled: ${new Date(manifest.pullDate).toLocaleDateString()})`;
                                    item.tooltip = `ID: ${manifest.id}
Portal: ${manifest.portal}
Pulled: ${new Date(manifest.pullDate).toLocaleString()}`;
                                    item.command = { command: 'logicmonitor.openLocalModule', title: 'Open Local Module', arguments: [modulePath] };
                                    modulesInType.push(item);
                                }
                            } catch (error) {
                                console.error(`Error reading or parsing manifest.json for ${dirent.name}:`, error);
                            }
                        }
                    }
                }
                return Promise.resolve(modulesInType.sort((a, b) => (a.label as string).localeCompare(b.label as string)));
            } else if (element.id === 'remote-modules-root') {
                const dataSourcesRoot = new vscode.TreeItem('DataSources', vscode.TreeItemCollapsibleState.Collapsed);
                dataSourcesRoot.id = 'remote-data-sources';
                const propertySourcesRoot = new vscode.TreeItem('PropertySources', vscode.TreeItemCollapsibleState.Collapsed);
                propertySourcesRoot.id = 'remote-property-sources';
                const eventSourcesRoot = new vscode.TreeItem('EventSources', vscode.TreeItemCollapsibleState.Collapsed);
                eventSourcesRoot.id = 'remote-event-sources';
                const configSourcesRoot = new vscode.TreeItem('ConfigSources', vscode.TreeItemCollapsibleState.Collapsed);
                configSourcesRoot.id = 'remote-config-sources';
                const topologySourcesRoot = new vscode.TreeItem('TopologySources', vscode.TreeItemCollapsibleState.Collapsed);
                topologySourcesRoot.id = 'remote-topology-sources';
                const logSourcesRoot = new vscode.TreeItem('LogSources', vscode.TreeItemCollapsibleState.Collapsed);
                logSourcesRoot.id = 'remote-log-sources';
                const sysOidMapsRoot = new vscode.TreeItem('SysOID Maps', vscode.TreeItemCollapsibleState.Collapsed);
                sysOidMapsRoot.id = 'remote-sys-oid-maps';
                const appliesToFunctionsRoot = new vscode.TreeItem('AppliesTo Functions', vscode.TreeItemCollapsibleState.Collapsed);
                appliesToFunctionsRoot.id = 'remote-applies-to-functions';
                return Promise.resolve([dataSourcesRoot, propertySourcesRoot, eventSourcesRoot, configSourcesRoot, topologySourcesRoot, logSourcesRoot, sysOidMapsRoot, appliesToFunctionsRoot]);
            } else if (element.id === 'remote-data-sources') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote datasources')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remoteDataSources = await getRemoteDataSources(this.context, this.outputChannel, portalDetails);
                this.context.workspaceState.update('logicmonitor.remoteDataSources', remoteDataSources);

                const groups = new Set(remoteDataSources.map(ds => ds.displayName.charAt(0).toUpperCase()));
                return Array.from(groups).sort().map(group => {
                    const item = new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = `datasource-group-${group}`;
                    return item;
                });
            } else if (element.id?.startsWith('datasource-group-')) {
                const group = element.id.replace('datasource-group-', '');
                const remoteDataSources = this.context.workspaceState.get<DataSource[]>('logicmonitor.remoteDataSources') || [];
                return remoteDataSources
                    .filter(ds => ds.displayName.charAt(0).toUpperCase() === group)
                    .map(dataSource => {
                        const item = new vscode.TreeItem(`${dataSource.displayName} (${dataSource.name})`, vscode.TreeItemCollapsibleState.None);
                        item.id = `remote-datasource-${dataSource.id}`;
                        item.contextValue = 'remote-datasource';
                        item.command = { command: 'logicmonitor.pullDataSource', title: 'Pull DataSource', arguments: [dataSource] };
                        return item;
                    });
            } else if (element.id === 'remote-property-sources') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote propertysources')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remotePropertySources = await getRemotePropertySources(this.context, this.outputChannel, portalDetails);
                this.context.workspaceState.update('logicmonitor.remotePropertySources', remotePropertySources);

                const groups = new Set(remotePropertySources.map(ps => ps.name.charAt(0).toUpperCase()));
                return Array.from(groups).sort().map(group => {
                    const item = new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = `propertysource-group-${group}`;
                    return item;
                });
            } else if (element.id?.startsWith('propertysource-group-')) {
                const group = element.id.replace('propertysource-group-', '');
                const remotePropertySources = this.context.workspaceState.get<PropertySource[]>('logicmonitor.remotePropertySources') || [];
                return remotePropertySources
                    .filter(ps => ps.name.charAt(0).toUpperCase() === group)
                    .map(propertySource => {
                        const item = new vscode.TreeItem(propertySource.name, vscode.TreeItemCollapsibleState.None);
                        item.id = `remote-propertysource-${propertySource.id}`;
                        // item.command = { command: 'logicmonitor.pullPropertySource', title: 'Pull PropertySource', arguments: [propertySource.id, propertySource.name] };
                        return item;
                    });
            } else if (element.id === 'remote-event-sources') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote eventsources')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remoteEventSources = await getRemoteEventSources(this.context, this.outputChannel, portalDetails);
                this.context.workspaceState.update('logicmonitor.remoteEventSources', remoteEventSources);

                const groups = new Set(remoteEventSources.map(es => es.name.charAt(0).toUpperCase()));
                return Array.from(groups).sort().map(group => {
                    const item = new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = `eventsource-group-${group}`;
                    return item;
                });
            } else if (element.id?.startsWith('eventsource-group-')) {
                const group = element.id.replace('eventsource-group-', '');
                const remoteEventSources = this.context.workspaceState.get<EventSource[]>('logicmonitor.remoteEventSources') || [];
                return remoteEventSources
                    .filter(es => es.name.charAt(0).toUpperCase() === group)
                    .map(eventSource => {
                        const item = new vscode.TreeItem(eventSource.name, vscode.TreeItemCollapsibleState.None);
                        item.id = `remote-eventsource-${eventSource.id}`;
                        // item.command = { command: 'logicmonitor.pullEventSource', title: 'Pull EventSource', arguments: [eventSource.id, eventSource.name] };
                        return item;
                    });
            } else if (element.id === 'remote-config-sources') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote configsources')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remoteConfigSources = await getRemoteConfigSources(this.context, this.outputChannel, portalDetails);
                this.context.workspaceState.update('logicmonitor.remoteConfigSources', remoteConfigSources);

                const groups = new Set(remoteConfigSources.map(cs => cs.name.charAt(0).toUpperCase()));
                return Array.from(groups).sort().map(group => {
                    const item = new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = `configsource-group-${group}`;
                    return item;
                });
            } else if (element.id?.startsWith('configsource-group-')) {
                const group = element.id.replace('configsource-group-', '');
                const remoteConfigSources = this.context.workspaceState.get<ConfigSource[]>('logicmonitor.remoteConfigSources') || [];
                return remoteConfigSources
                    .filter(cs => cs.name.charAt(0).toUpperCase() === group)
                    .map(configSource => {
                        const item = new vscode.TreeItem(configSource.name, vscode.TreeItemCollapsibleState.None);
                        item.id = `remote-configsource-${configSource.id}`;
                        // item.command = { command: 'logicmonitor.pullConfigSource', title: 'Pull ConfigSource', arguments: [configSource.id, configSource.name] };
                        return item;
                    });
            } else if (element.id === 'remote-topology-sources') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote topologysources')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remoteTopologySources = await getRemoteTopologySources(this.context, this.outputChannel, portalDetails);
                this.context.workspaceState.update('logicmonitor.remoteTopologySources', remoteTopologySources);

                const groups = new Set(remoteTopologySources.map(ts => ts.name.charAt(0).toUpperCase()));
                return Array.from(groups).sort().map(group => {
                    const item = new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = `topologysource-group-${group}`;
                    return item;
                });
            } else if (element.id?.startsWith('topologysource-group-')) {
                const group = element.id.replace('topologysource-group-', '');
                const remoteTopologySources = this.context.workspaceState.get<TopologySource[]>('logicmonitor.remoteTopologySources') || [];
                return remoteTopologySources
                    .filter(ts => ts.name.charAt(0).toUpperCase() === group)
                    .map(topologySource => {
                        const item = new vscode.TreeItem(topologySource.name, vscode.TreeItemCollapsibleState.None);
                        item.id = `remote-topologysource-${topologySource.id}`;
                        // item.command = { command: 'logicmonitor.pullTopologySource', title: 'Pull TopologySource', arguments: [topologySource.id, topologySource.name] };
                        return item;
                    });
            } else if (element.id === 'remote-log-sources') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote logsources')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remoteLogSources = await getRemoteLogSources(this.context, this.outputChannel, portalDetails);
                this.context.workspaceState.update('logicmonitor.remoteLogSources', remoteLogSources);

                const groups = new Set(remoteLogSources.map(ls => ls.name.charAt(0).toUpperCase()));
                return Array.from(groups).sort().map(group => {
                    const item = new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = `logsource-group-${group}`;
                    return item;
                });
            } else if (element.id?.startsWith('logsource-group-')) {
                const group = element.id.replace('logsource-group-', '');
                const remoteLogSources = this.context.workspaceState.get<LogSource[]>('logicmonitor.remoteLogSources') || [];
                return remoteLogSources
                    .filter(ls => ls.name.charAt(0).toUpperCase() === group)
                    .map(logSource => {
                        const item = new vscode.TreeItem(logSource.name, vscode.TreeItemCollapsibleState.None);
                        item.id = `remote-logsource-${logSource.id}`;
                        // item.command = { command: 'logicmonitor.pullLogSource', title: 'Pull LogSource', arguments: [logSource.id, logSource.name] };
                        return item;
                    });
            } else if (element.id === 'remote-sys-oid-maps') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote sys-oid maps')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remoteSysOidMaps = await getRemoteSysOidMaps(this.context, this.outputChannel, portalDetails);
                return remoteSysOidMaps.map(sysOidMap => {
                    const item = new vscode.TreeItem(sysOidMap.oid, vscode.TreeItemCollapsibleState.None);
                    item.id = `remote-sys-oid-map-${sysOidMap.id}`;
                    // item.command = { command: 'logicmonitor.pullSysOidMap', title: 'Pull SysOidMap', arguments: [sysOidMap.id, sysOidMap.oid] };
                    return item;
                });
            } else if (element.id === 'remote-applies-to-functions') {
                const activePortalName = this.context.workspaceState.get<string>('logicmonitor.activePortal');
                if (!activePortalName) {
                    return Promise.resolve([new vscode.TreeItem('Select a portal to view remote applies-to functions')]);
                }
                const portalDetails = (await getCredentials(this.context))?.find(([name, _]) => name === activePortalName)?.[1];
                if (!portalDetails) {
                    return Promise.resolve([new vscode.TreeItem('Portal details not found')]);
                }
                const remoteAppliesToFunctions = await getRemoteAppliesToFunctions(this.context, this.outputChannel, portalDetails);
                this.context.workspaceState.update('logicmonitor.remoteAppliesToFunctions', remoteAppliesToFunctions);

                const groups = new Set(remoteAppliesToFunctions.map(af => af.name.charAt(0).toUpperCase()));
                return Array.from(groups).sort().map(group => {
                    const item = new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Collapsed);
                    item.id = `applies-to-function-group-${group}`;
                    return item;
                });
            } else if (element.id?.startsWith('applies-to-function-group-')) {
                const group = element.id.replace('applies-to-function-group-', '');
                const remoteAppliesToFunctions = this.context.workspaceState.get<AppliesToFunction[]>('logicmonitor.remoteAppliesToFunctions') || [];
                return remoteAppliesToFunctions
                    .filter(af => af.name.charAt(0).toUpperCase() === group)
                    .map(appliesToFunction => {
                        const item = new vscode.TreeItem(appliesToFunction.name, vscode.TreeItemCollapsibleState.None);
                        item.id = `remote-applies-to-function-${appliesToFunction.id}`;
                        // item.command = { command: 'logicmonitor.pullAppliesToFunction', title: 'Pull AppliesToFunction', arguments: [appliesToFunction.id, appliesToFunction.name] };
                        return item;
                    });
            }
            return Promise.resolve([]);
        } else {
            const localModulesRoot = new vscode.TreeItem('Local', vscode.TreeItemCollapsibleState.Collapsed);
            localModulesRoot.id = 'local-modules-root';
            const remoteModulesRoot = new vscode.TreeItem('Remote', vscode.TreeItemCollapsibleState.Collapsed);
            remoteModulesRoot.id = 'remote-modules-root';
            return Promise.resolve([localModulesRoot, remoteModulesRoot]);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {

    const outputChannel = vscode.window.createOutputChannel("LogicMonitor");

    const settingsProvider = new SettingsProvider(context);
    vscode.window.registerTreeDataProvider('logicmonitor-settings', settingsProvider);

    const currentSelectionsProvider = new CurrentSelectionsProvider(context, outputChannel);
    vscode.window.registerTreeDataProvider('logicmonitor-current-selections', currentSelectionsProvider);

    const navigationProvider = new NavigationProvider(context, outputChannel);
    vscode.window.registerTreeDataProvider('logicmonitor-navigation', navigationProvider);

    const modulesProvider = new ModulesProvider(context, outputChannel);
    vscode.window.registerTreeDataProvider('logicmonitor-modules', modulesProvider);

    let lastActiveScriptEditorUri: vscode.Uri | undefined;

    // Initialize lastActiveScriptEditorUri on activation
    if (vscode.window.activeTextEditor && (vscode.window.activeTextEditor.document.languageId === 'groovy' || vscode.window.activeTextEditor.document.languageId === 'powershell')) {
        lastActiveScriptEditorUri = vscode.window.activeTextEditor.document.uri;
    }

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && (editor.document.languageId === 'groovy' || editor.document.languageId === 'powershell')) {
            lastActiveScriptEditorUri = editor.document.uri;
        }
    }));


    let setCredentials = vscode.commands.registerCommand('logicmonitor.setCredentials', async () => {
        const creds = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select creds.json'
        });

        if (creds && creds.length > 0) {
            await context.workspaceState.update('logicmonitor.credentialsPath', creds[0].fsPath);
            settingsProvider.refresh(); // Refresh settings view
            navigationProvider.refresh(); // Refresh navigation view
        }
    });

    let setActivePortal = vscode.commands.registerCommand('logicmonitor.setActivePortal', async (portalName: string) => {
        await context.workspaceState.update('logicmonitor.activePortal', portalName);
        // Clear active collector and device when portal changes
        await context.workspaceState.update('logicmonitor.activeCollectorId', undefined);
        await context.workspaceState.update('logicmonitor.activeCollectorDescription', undefined);
        await context.workspaceState.update('logicmonitor.activeDeviceId', undefined);
        await context.workspaceState.update('logicmonitor.activeDeviceDisplayName', undefined);
        await context.workspaceState.update('logicmonitor.activeDeviceHostname', undefined);
        navigationProvider.refresh(); // Refresh navigation view
        currentSelectionsProvider.refresh(); // Refresh current selections view
    });

    let setActiveDevice = vscode.commands.registerCommand('logicmonitor.setActiveDevice', async (portalName: string, collectorId: number, collectorDescription: string, deviceId: number, deviceDisplayName: string, deviceHostname: string) => {
        await context.workspaceState.update('logicmonitor.activePortal', portalName);
        await context.workspaceState.update('logicmonitor.activeCollectorId', collectorId);
        await context.workspaceState.update('logicmonitor.activeCollectorDescription', collectorDescription);
        await context.workspaceState.update('logicmonitor.activeDeviceId', deviceId);
        await context.workspaceState.update('logicmonitor.activeDeviceDisplayName', deviceDisplayName);
        await context.workspaceState.update('logicmonitor.activeDeviceHostname', deviceHostname);
        currentSelectionsProvider.refresh(); // Refresh current selections view
    });

    let runActiveScript = vscode.commands.registerCommand('logicmonitor.runActiveScript', async () => {
        const debugEnabled = context.workspaceState.get<boolean>('logicmonitor.debugEnabled', false);
        
        let document: vscode.TextDocument | undefined;

        if (lastActiveScriptEditorUri) {
            try {
                document = await vscode.workspace.openTextDocument(lastActiveScriptEditorUri);
            } catch (e) {
                // If the document is no longer open or accessible, clear the URI
                lastActiveScriptEditorUri = undefined;
            }
        }

        // Fallback to current active editor if lastActiveScriptEditorUri is not valid
        if (!document && vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            if (editor.document.languageId === 'groovy' || editor.document.languageId === 'powershell') {
                document = editor.document;
                lastActiveScriptEditorUri = editor.document.uri; // Update URI if a new valid editor is found
            }
        }

        if (!document) {
            vscode.window.showWarningMessage('No active script editor found. Please open a .groovy or .ps1 file.');
            return;
        }

        const scriptContent = document.getText();
        const fileExtension = document.fileName.split('.').pop();
        let scriptType: string;

        if (fileExtension === 'groovy' || document.languageId === 'groovy') {
            scriptType = '!groovy';
        } else if (fileExtension === 'ps1' || document.languageId === 'powershell') {
            scriptType = '!posh';
        } else {
            vscode.window.showWarningMessage(`Unsupported script type. Only .groovy and .ps1 files, or files with language modes 'groovy' or 'powershell' are supported. Current language ID: ${document.languageId}`);
            return;
        }

        const activePortalName = context.workspaceState.get<string>('logicmonitor.activePortal');
        const activeDeviceId = context.workspaceState.get<number>('logicmonitor.activeDeviceId');
        const activeCollectorId = context.workspaceState.get<number>('logicmonitor.activeCollectorId');

        if (!activePortalName || !activeDeviceId || !activeCollectorId) {
            vscode.window.showErrorMessage('Please select an active portal, collector, and device in the LogicMonitor sidebar.');
            return;
        }

        const portalDetails = (await getCredentials(context))?.find(([name, _]) => name === activePortalName)?.[1];

        if (!portalDetails) {
            vscode.window.showErrorMessage(`Portal details for ${activePortalName} not found.`);
            return;
        }

        const resourcePath = `/debug`;
        const queryParams = {
            collectorId: String(activeCollectorId)
        };
        const payload = {
            cmdline: `${scriptType} hostId=${activeDeviceId}\n${scriptContent}`
        };
        const url = `https://${portalDetails.COMPANY_NAME}.logicmonitor.com/santaba/rest${resourcePath}?collectorId=${activeCollectorId}`;

        if (debugEnabled) {
            outputChannel.appendLine(`\n--- Making Debug API Call ---`);
            outputChannel.appendLine(`URL: ${url}`);
            outputChannel.appendLine(`Payload: ${JSON.stringify(payload, null, 2)}`);
        }

        try {
            const apiResponse = await makeApiRequest(context, outputChannel, portalDetails, 'POST', resourcePath, payload, queryParams);
            if (debugEnabled) {
                outputChannel.appendLine(`\n--- Debug API Response ---`);
                outputChannel.appendLine(JSON.stringify(apiResponse, null, 2));
                outputChannel.appendLine(`--- End Debug API Response ---`);
            }

            const sessionId = apiResponse.sessionId;
            if (sessionId) {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "LogicMonitor: Running Script",
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: "Task submitted to collector..." });
                    await pollDebugSession(context, outputChannel, portalDetails, activeCollectorId, sessionId, progress);
                });
            } else {
                vscode.window.showErrorMessage('Failed to start debug session: No sessionId returned.');
            }
        } catch (error: any) {
            outputChannel.appendLine(`
--- Debug API Error ---`);
            outputChannel.appendLine(`Error: ${error.message}`);
            outputChannel.appendLine(`--- End Debug API Error ---`);
            vscode.window.showErrorMessage(`Debug API call failed: ${error.message}`);
        }
        outputChannel.show();
    });

    let toggleDebug = vscode.commands.registerCommand('logicmonitor.toggleDebug', async () => {
        const debugEnabled = context.workspaceState.get<boolean>('logicmonitor.debugEnabled', false);
        await context.workspaceState.update('logicmonitor.debugEnabled', !debugEnabled);
        settingsProvider.refresh(); // Refresh settings view
    });

    let pullDataSource = vscode.commands.registerCommand('logicmonitor.pullDataSource', async (treeItem: vscode.TreeItem) => {
        console.log('Received item for pullDataSource:', treeItem);
        const dataSourceIdMatch = treeItem.id?.match(/remote-datasource-(\d+)/);
        if (!dataSourceIdMatch || !dataSourceIdMatch[1]) {
            vscode.window.showErrorMessage('Could not determine DataSource ID from the selected item.');
            return;
        }
        const dataSourceId = dataSourceIdMatch[1];

        let dataSourceName = 'Unknown';
        if (typeof treeItem.label === 'string') {
            const nameMatch = treeItem.label.match(/\(([^)]+)\)/);
            if (nameMatch && nameMatch[1]) {
                dataSourceName = nameMatch[1];
            } else {
                dataSourceName = treeItem.label; // Fallback if regex fails
            }
        } else if (typeof treeItem.label === 'object' && treeItem.label.label) {
            const nameMatch = treeItem.label.label.match(/\(([^)]+)\)/);
            if (nameMatch && nameMatch[1]) {
                dataSourceName = nameMatch[1];
            } else {
                dataSourceName = treeItem.label.label; // Fallback
            }
        }
        const debugEnabled = context.workspaceState.get<boolean>('logicmonitor.debugEnabled', false);
        const activePortalName = context.workspaceState.get<string>('logicmonitor.activePortal');

        if (!activePortalName) {
            vscode.window.showErrorMessage('Please select an active portal in the LogicMonitor sidebar.');
            return;
        }

        const portalDetails = (await getCredentials(context))?.find(([name, _]) => name === activePortalName)?.[1];

        if (!portalDetails) {
            vscode.window.showErrorMessage(`Portal details for ${activePortalName} not found.`);
            return;
        }

        const resourcePath = `/setting/datasources/${dataSourceId}`;
        const queryParams = { format: 'json' };

        if (debugEnabled) {
            outputChannel.appendLine(`\n--- Pulling DataSource ---`);
            outputChannel.appendLine(`DataSource ID: ${dataSourceId}`);
            outputChannel.appendLine(`DataSource Name: ${dataSourceName}`);
            outputChannel.appendLine(`URL: https://${portalDetails.COMPANY_NAME}.logicmonitor.com/santaba/rest${resourcePath}?format=json`);
        }

        try {
            const dataSourceDefinition = await makeApiRequest(context, outputChannel, portalDetails, 'GET', resourcePath, null, queryParams);

            if (debugEnabled) {                outputChannel.appendLine(`
--- DataSource Definition ---`);                outputChannel.appendLine(JSON.stringify(dataSourceDefinition, null, 2));                outputChannel.appendLine(`--- End DataSource Definition ---`);            }            console.log("DataSource Definition:", JSON.stringify(dataSourceDefinition, null, 2));

            // Save the module definition to a local file
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder open. Cannot save DataSource.');
                return;
            }
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const moduleDir = path.join(workspaceRoot, dataSourceName);

            if (!fs.existsSync(moduleDir)) {
                fs.mkdirSync(moduleDir, { recursive: true });
            }

            const moduleFilePath = path.join(moduleDir, `${dataSourceName}.json`); // Assuming JSON format
            fs.writeFileSync(moduleFilePath, JSON.stringify(dataSourceDefinition, null, 2));

            // Create and save the manifest file
            const manifestContent = {
                name: dataSourceName,
                displayName: treeItem.label, // Use the full display name from the tree item
                id: dataSourceId,
                portal: activePortalName,
                moduleType: "DataSource", // Add the module type
                pullDate: new Date().toISOString()
            };
            const manifestFilePath = path.join(moduleDir, `manifest.json`);
            fs.writeFileSync(manifestFilePath, JSON.stringify(manifestContent, null, 2));
            vscode.window.showInformationMessage(`Manifest saved to ${manifestFilePath}`);

            // Extract and save discovery script if present
            if (dataSourceDefinition.autoDiscoveryConfig && dataSourceDefinition.autoDiscoveryConfig.method) {
                let scriptContent: string | undefined;
                let scriptExtension: string = ".groovy"; // Default to groovy

                if (dataSourceDefinition.autoDiscoveryConfig.method.groovyScript) {
                    scriptContent = dataSourceDefinition.autoDiscoveryConfig.method.groovyScript;
                    scriptExtension = ".groovy";
                } else if (dataSourceDefinition.autoDiscoveryConfig.method.winScript) {
                    scriptContent = dataSourceDefinition.autoDiscoveryConfig.method.winScript;
                    scriptExtension = ".ps1";
                }

                if (scriptContent) {
                    const scriptFileName = `discovery${scriptExtension}`;
                    const scriptFilePath = path.join(moduleDir, scriptFileName);
                    fs.writeFileSync(scriptFilePath, scriptContent);
                    vscode.window.showInformationMessage(`Discovery script saved to ${scriptFilePath}`);
                }
            }

            // Extract and save collection script if present
            if (dataSourceDefinition.collectorAttribute) {
                let scriptContent: string | undefined;
                let scriptExtension: string = ".groovy"; // Default to groovy

                if (dataSourceDefinition.collectorAttribute.groovyScript) {
                    scriptContent = dataSourceDefinition.collectorAttribute.groovyScript;
                    scriptExtension = ".groovy";
                } else if (dataSourceDefinition.collectorAttribute.windowsScript) {
                    scriptContent = dataSourceDefinition.collectorAttribute.windowsScript;
                    scriptExtension = ".ps1";
                }

                if (scriptContent) {
                    const scriptFileName = `collection${scriptExtension}`;
                    const scriptFilePath = path.join(moduleDir, scriptFileName);
                    fs.writeFileSync(scriptFilePath, scriptContent);
                    vscode.window.showInformationMessage(`Collection script saved to ${scriptFilePath}`);
                }
            }

            vscode.window.showInformationMessage(`DataSource '${dataSourceName}' pulled successfully to ${moduleFilePath}`);

        } catch (error: any) {
            outputChannel.appendLine(`
--- Pull DataSource Error ---`);            outputChannel.appendLine(`Error: ${error.message}`);            outputChannel.appendLine(`--- End Pull DataSource Error ---`);            vscode.window.showErrorMessage(`Failed to pull DataSource '${dataSourceName}': ${error.message}`);
        }
        outputChannel.show();
    });

    let openLocalModule = vscode.commands.registerCommand('logicmonitor.openLocalModule', async (modulePath: string) => {
        const uri = vscode.Uri.file(modulePath);
        await vscode.commands.executeCommand('vscode.openFolder', uri, true);
    });

    context.subscriptions.push(setCredentials, setActivePortal, setActiveDevice, runActiveScript, toggleDebug, pullDataSource, openLocalModule);
}

export function deactivate() {}