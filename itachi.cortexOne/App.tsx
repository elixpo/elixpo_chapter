import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Sidebar from "./components/Sidebar";
import MainContentView from "./components/ChatView";

import ContextMenu from "./components/ContextMenu";
import SettingsView from "./components/SettingsView";

import useLocalStorage from "./hooks/useLocalStorage";
import useElectronStorage from "./hooks/useElectronStorage";
import {
  Session,
  Message,
  Role,
  Project,
  Settings,
  Provider,
  Tool,
  ToolCall,
  Plugin,
  McpServer,
  PluginServer,
} from "./types";
import { sendMessageStream, generateTitle } from "./services/apiService";
import {
  fetchPluginsFromServer,
  executeToolCall,
} from "./services/pluginService";
import { memoryService } from "./services/memoryService";
import { v4 as uuidv4 } from "uuid";
import {
  RenameIcon,
  ArchiveIcon,
  DeleteIcon,
  EditIcon,
  CopyIcon,
  RefreshIcon,
  ImageIcon,
} from "./components/icons";

// FIX: Export interface to be used in other components.
export interface DiscoveredPluginSource {
  server: PluginServer;
  plugins: Plugin[];
}

export interface McpProcessState {
  pid: number;
  status: "starting" | "running" | "stopping" | "error" | "stopped";
  log: string[];
  discoveredUrl?: string;
}

const App: React.FC = () => {
  const defaultSettings: Settings = {
    providers: [],
    modelAssignments: { main: null, background: null },
    claudeDesktopConfig: {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          alwaysAllowTools: ["*"],
        },
        "sequential-thinking": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
          alwaysAllowTools: ["*"],
        },
      },
    },
    pluginServers: [],
    pluginSettings: {},
  };

  const getSessionsCallback = useCallback(
    () => window.desktopApi?.getSessions() || Promise.resolve([]),
    []
  );
  const saveSessionsCallback = useCallback(
    (sessions: Session[]) =>
      window.desktopApi?.saveSessions(sessions) ||
      Promise.resolve({ success: true }),
    []
  );

  const getProjectsCallback = useCallback(
    () => window.desktopApi?.getProjects() || Promise.resolve([]),
    []
  );
  const saveProjectsCallback = useCallback(
    (projects: Project[]) =>
      window.desktopApi?.saveProjects(projects) ||
      Promise.resolve({ success: true }),
    []
  );

  const getSettingsCallback = useCallback(
    () => window.desktopApi?.getSettings() || Promise.resolve(null),
    []
  );
  const saveSettingsCallback = useCallback(
    (settings: Settings) =>
      window.desktopApi?.saveSettings(settings) ||
      Promise.resolve({ success: true }),
    []
  );

  const [sessions, setSessions] = useElectronStorage<Session[]>(
    "chat-sessions",
    [],
    getSessionsCallback,
    saveSessionsCallback
  );

  const [projects, setProjects] = useElectronStorage<Project[]>(
    "chat-projects",
    [],
    getProjectsCallback,
    saveProjectsCallback
  );

  const [settings, setSettings] = useElectronStorage<Settings>(
    "app-settings",
    defaultSettings,
    getSettingsCallback,
    saveSettingsCallback
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [currentAbortController, setCurrentAbortController] =
    useState<AbortController | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: any[];
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [discoveredPluginSources, setDiscoveredPluginSources] = useState<
    DiscoveredPluginSource[]
  >([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[] | null>(
    null
  );
  const [mcpServerStatus, setMcpServerStatus] = useState<
    Record<string, "running" | "stopped" | "error">
  >({});
  const [enabledToolNames, setEnabledToolNames] = useState<string[]>([]);
  const [isExtendedThinkingEnabled, setIsExtendedThinkingEnabled] =
    useState(false);

  const mcpServersInitialized = useRef<Set<string>>(new Set());
  const lastLoggedTools = useRef<string>("");

  // Initialize memory service on app start
  useEffect(() => {
    memoryService.init();
  }, []);

  useEffect(() => {
    // One-time migration from old settings structure
    const currentSettings = settings as any;
    if (
      settings &&
      (!currentSettings.modelAssignments || !currentSettings.pluginServers)
    ) {
      const oldSettings = currentSettings;
      const activeProvider = oldSettings.providers.find(
        (p: any) => p.id === oldSettings.activeProviderId
      );

      const newSettings: Settings = {
        providers: oldSettings.providers.map(({ model, ...p }: any) => p),
        modelAssignments: oldSettings.modelAssignments || {
          main: activeProvider
            ? { providerId: activeProvider.id, modelId: activeProvider.model }
            : null,
          background: null,
        },
        claudeDesktopConfig: currentSettings.claudeDesktopConfig || {
          mcpServers: {},
        },
        pluginServers: currentSettings.pluginServers || [],
        pluginSettings: oldSettings.pluginSettings || {},
      };
      setSettings(newSettings);
    }
  }, [settings, setSettings]);

  // Removed automatic session creation on startup
  // Sessions are now created lazily when user sends first message

  // Discover tools from running MCP servers (Claude Desktop style)
  useEffect(() => {
    const discoverMcpTools = async () => {
      if (!window.desktopApi) return;

      const sources: DiscoveredPluginSource[] = [];

      for (const [serverName, config] of Object.entries(
        settings.claudeDesktopConfig?.mcpServers || {}
      )) {
        try {
          const status = await window.desktopApi.getMcpServerStatus(serverName);
          if (status === "running") {
            // Log discovery (removed NODE_ENV check since process is not available in renderer)
            console.log(`Discovering tools from MCP server: ${serverName}`);

            // Wait a moment for server to be ready
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Request tools list from MCP server
            const toolsResponse = await window.desktopApi.sendMcpRequest(
              serverName,
              {
                method: "tools/list",
                params: {},
              }
            );

            console.log(`Tools response from ${serverName}:`, toolsResponse);

            if (toolsResponse?.tools && Array.isArray(toolsResponse.tools)) {
              const plugin: Plugin = {
                id: serverName,
                name: serverName,
                description: `MCP Server: ${serverName}`,
                tools: toolsResponse.tools.map((tool: any) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description || `Tool from ${serverName}`,
                    parameters: tool.inputSchema || {
                      type: "object",
                      properties: {},
                    },
                  },
                })),
              };

              console.log(
                `Discovered ${plugin.tools.length} tools from ${serverName}:`,
                plugin.tools.map((t) => t.function.name)
              );
              if (serverName === "sequential-thinking") {
                console.log("Sequential thinking server tools:", plugin.tools);
              }

              sources.push({
                server: {
                  id: serverName,
                  name: serverName,
                  command: config.command,
                  args: config.args,
                  env: config.env,
                },
                plugins: [plugin],
              });
            } else {
              console.log(`No tools found in response from ${serverName}`);
            }
          }
        } catch (error) {
          console.error(
            `Failed to discover tools from MCP server ${serverName}:`,
            error
          );
        }
      }

      console.log(`Total discovered plugin sources: ${sources.length}`);
      setDiscoveredPluginSources(sources);
    };

    // Delay discovery to allow servers to start (increased delay for sequential-thinking server)
    const timer = setTimeout(() => {
      console.log("Starting MCP tool discovery...");
      discoverMcpTools();
    }, 5000);
    return () => clearTimeout(timer);
  }, [settings.claudeDesktopConfig?.mcpServers]);

  // Manual tool discovery function
  const rediscoverMcpTools = useCallback(async () => {
    console.log("Manually rediscovering MCP tools...");
    const sources: DiscoveredPluginSource[] = [];

    for (const [serverName, config] of Object.entries(
      settings.claudeDesktopConfig?.mcpServers || {}
    )) {
      try {
        const status = await window.desktopApi.getMcpServerStatus(serverName);
        console.log(`Server ${serverName} status:`, status);

        if (status === "running") {
          console.log(`Discovering tools from MCP server: ${serverName}`);

          // Wait a moment for server to be ready
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Request tools list from MCP server
          const toolsResponse = await window.desktopApi.sendMcpRequest(
            serverName,
            {
              method: "tools/list",
              params: {},
            }
          );

          console.log(`Tools response from ${serverName}:`, toolsResponse);

          if (toolsResponse?.tools && Array.isArray(toolsResponse.tools)) {
            const plugin: Plugin = {
              id: serverName,
              name: serverName,
              description: `MCP Server: ${serverName}`,
              tools: toolsResponse.tools.map((tool: any) => ({
                type: "function",
                function: {
                  name: tool.name,
                  description: tool.description || `Tool from ${serverName}`,
                  parameters: tool.inputSchema || {
                    type: "object",
                    properties: {},
                  },
                },
              })),
            };

            console.log(
              `Discovered ${plugin.tools.length} tools from ${serverName}:`,
              plugin.tools.map((t) => t.function.name)
            );

            sources.push({
              server: {
                id: serverName,
                name: serverName,
                command: config.command,
                args: config.args,
                env: config.env,
              },
              plugins: [plugin],
            });
          } else {
            console.log(`No tools found in response from ${serverName}`);
          }
        }
      } catch (error) {
        console.error(
          `Failed to discover tools from MCP server ${serverName}:`,
          error
        );
      }
    }

    console.log(`Total discovered plugin sources: ${sources.length}`);
    setDiscoveredPluginSources(sources);
  }, [settings.claudeDesktopConfig?.mcpServers]);

  // MCP Server Management (Claude Desktop style)
  const startMcpServer = useCallback(
    async (serverName: string) => {
      if (!window.desktopApi) return false;

      const config = settings.claudeDesktopConfig?.mcpServers[serverName];
      if (!config) return false;

      try {
        const success = await window.desktopApi.startMcpServer(
          serverName,
          config
        );

        // Check actual status after start attempt
        setTimeout(async () => {
          try {
            const actualStatus = await window.desktopApi.getMcpServerStatus(
              serverName
            );
            setMcpServerStatus((prev) => ({
              ...prev,
              [serverName]: actualStatus,
            }));
          } catch (error) {
            setMcpServerStatus((prev) => ({ ...prev, [serverName]: "error" }));
          }
        }, 500);

        return success;
      } catch (error) {
        console.error(`Failed to start MCP server ${serverName}:`, error);
        setMcpServerStatus((prev) => ({ ...prev, [serverName]: "error" }));
        return false;
      }
    },
    [settings.claudeDesktopConfig?.mcpServers]
  );

  const stopMcpServer = useCallback(async (serverName: string) => {
    if (!window.desktopApi) return false;

    try {
      const success = await window.desktopApi.stopMcpServer(serverName);

      // Check actual status after stop attempt
      setTimeout(async () => {
        try {
          const actualStatus = await window.desktopApi.getMcpServerStatus(
            serverName
          );
          setMcpServerStatus((prev) => ({
            ...prev,
            [serverName]: actualStatus,
          }));
        } catch (error) {
          setMcpServerStatus((prev) => ({ ...prev, [serverName]: "error" }));
        }
      }, 500);

      return success;
    } catch (error) {
      console.error(`Failed to stop MCP server ${serverName}:`, error);
      setMcpServerStatus((prev) => ({ ...prev, [serverName]: "error" }));
      return false;
    }
  }, []);

  const restartMcpServer = useCallback(
    async (serverName: string) => {
      if (!window.desktopApi) return false;

      const config = settings.claudeDesktopConfig?.mcpServers[serverName];
      if (!config) return false;

      try {
        console.log(`Restarting MCP server: ${serverName}`);
        // Stop first
        await window.desktopApi.stopMcpServer(serverName);
        setMcpServerStatus((prev) => ({ ...prev, [serverName]: "stopped" }));

        // Wait a moment for cleanup
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Start again
        const success = await window.desktopApi.startMcpServer(
          serverName,
          config
        );

        // Check actual status after restart attempt
        setTimeout(async () => {
          try {
            const actualStatus = await window.desktopApi.getMcpServerStatus(
              serverName
            );
            setMcpServerStatus((prev) => ({
              ...prev,
              [serverName]: actualStatus,
            }));
          } catch (error) {
            setMcpServerStatus((prev) => ({ ...prev, [serverName]: "error" }));
          }
        }, 500);

        return success;
      } catch (error) {
        console.error(`Failed to restart MCP server ${serverName}:`, error);
        setMcpServerStatus((prev) => ({ ...prev, [serverName]: "error" }));
        return false;
      }
    },
    [settings.claudeDesktopConfig?.mcpServers]
  );

  const { enabledTools, toolToServerMap, allAvailableTools } = useMemo(() => {
    const toolToServerMap = new Map<string, string>(); // tool name -> server name
    const enabledToolsForModel: Tool[] = [];
    const allTools: Tool[] = [];

    // Add built-in tools that are always available for the chat UI
    const builtInTools: Tool[] = [
      {
        type: "function",
        function: {
          name: "web_search",
          description:
            "Search the web for current information, news, and answers to questions",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query",
              },
            },
            required: ["query"],
          },
        },
      },
    ];

    // Add built-in tools to available tools (for UI display)
    for (const tool of builtInTools) {
      toolToServerMap.set(tool.function.name, "built-in");
      allTools.push(tool);
    }

    // Add MCP tools to the enabled tools for actual AI usage
    for (const source of discoveredPluginSources) {
      // For MCP servers, we consider them enabled if the server is configured
      const enabledPlugins = source.plugins.filter((p) => {
        // If it's an MCP server, check if it's in the MCP config
        if (settings.claudeDesktopConfig?.mcpServers[source.server.id]) {
          return true;
        }
        // For other plugins, use the pluginSettings
        return settings.pluginSettings[p.id]?.enabled !== false;
      });
      for (const plugin of enabledPlugins) {
        for (const tool of plugin.tools) {
          toolToServerMap.set(tool.function.name, source.server.id);
          allTools.push(tool);

          // Auto-enable all MCP tools since they have alwaysAllowTools: ["*"]
          // This ensures the AI knows about and can use the MCP tools
          enabledToolsForModel.push(tool);
        }
      }
    }

    // Add built-in tools to enabled tools if they're enabled
    for (const tool of builtInTools) {
      if (
        enabledToolNames.length === 0 ||
        enabledToolNames.includes(tool.function.name)
      ) {
        enabledToolsForModel.push(tool);
      }
    }

    // Only log when tools actually change (reduced spam)
    const toolNames = enabledToolsForModel
      .map((t) => t.function.name)
      .join(", ");
    if (toolNames && toolNames !== lastLoggedTools.current) {
      console.log(`Enabled tools for AI: ${toolNames}`);
      lastLoggedTools.current = toolNames;
    }
    return {
      enabledTools: enabledToolsForModel,
      toolToServerMap,
      allAvailableTools: allTools,
    };
  }, [
    discoveredPluginSources,
    settings.pluginSettings,
    enabledToolNames,
    settings.claudeDesktopConfig?.mcpServers,
  ]);

  // Initialize enabled tools when tools are first discovered
  useEffect(() => {
    if (allAvailableTools.length > 0 && enabledToolNames.length === 0) {
      // Enable all tools by default
      const toolNames = allAvailableTools.map((tool) => tool.function.name);
      console.log("Initializing enabled tools:", toolNames);
      setEnabledToolNames(toolNames);
    }
  }, [allAvailableTools, enabledToolNames.length]);

  const handleToggleTool = useCallback((toolName: string) => {
    setEnabledToolNames((prev) =>
      prev.includes(toolName)
        ? prev.filter((name) => name !== toolName)
        : [...prev, toolName]
    );
  }, []);

  const closeContextMenu = () => setContextMenu(null);

  const handleNewChat = () => {
    closeContextMenu();
    const newSession: Session = {
      id: uuidv4(),
      title: "New Chat",
      messages: [],
      isTemporary: true,
      projectId: null,
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handleNewProject = () => {
    closeContextMenu();
    const newProject: Project = { id: uuidv4(), name: "New Project" };
    setProjects((prev) => [...prev, newProject]);
    setRenamingId(newProject.id);
  };

  const handleRename = (
    id: string,
    newName: string,
    type: "session" | "project"
  ) => {
    if (type === "session") {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: newName } : s))
      );
    } else {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
      );
    }
    setRenamingId(null);
  };

  const handleDelete = (id: string, type: "session" | "project") => {
    if (type === "session") {
      if (activeSessionId === id) {
        const currentIndex = sessions.findIndex((s) => s.id === id);
        const nextSession =
          sessions[currentIndex - 1] || sessions[currentIndex + 1];
        setActiveSessionId(nextSession ? nextSession.id : null);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } else {
      setSessions((prev) =>
        prev.map((s) => (s.projectId === id ? { ...s, projectId: null } : s))
      );
      setProjects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleSessionContextMenu = (
    event: React.MouseEvent,
    item: Session | Project,
    type: "session" | "project"
  ) => {
    event.preventDefault();
    closeContextMenu();

    const menuItems = [
      {
        label: "Rename",
        icon: RenameIcon,
        action: () => setRenamingId(item.id),
      },
      {
        label: "Archive",
        icon: ArchiveIcon,
        action: () => {} /* Placeholder */,
      },
      {
        label: "Delete",
        icon: DeleteIcon,
        action: () => handleDelete(item.id, type),
        className: "text-red-400 hover:bg-red-500/20",
      },
    ];

    setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
  };

  const handleMessageContextMenu = (
    event: React.MouseEvent,
    message: Message
  ) => {
    event.preventDefault();
    closeContextMenu();

    let menuItems = [];

    if (message.role === Role.USER) {
      menuItems = [
        {
          label: "Edit",
          icon: EditIcon,
          action: () => {
            setInput(message.content);
            setEditingMessage(message);
          },
        },
        {
          label: "Copy",
          icon: CopyIcon,
          action: () => navigator.clipboard.writeText(message.content),
        },
      ];
    } else {
      // Model message
      menuItems = [
        {
          label: "Regenerate",
          icon: RefreshIcon,
          action: () => handleRegenerate(),
        },
        {
          label: "Copy",
          icon: CopyIcon,
          action: () => navigator.clipboard.writeText(message.content),
        },
        null,
        {
          label: "Generate Image",
          icon: ImageIcon,
          action: () => {} /* Placeholder */,
          disabled: true,
        },
      ];
    }

    setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
  };

  const updateSessionMessages = useCallback(
    (sessionId: string, updater: (messages: Message[]) => Message[]) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, messages: updater(s.messages) } : s
        )
      );
    },
    [setSessions]
  );

  const runConversationTurnRef = useRef<
    ((sessionId: string) => Promise<void>) | null
  >(null);

  const executeAndContinue = useCallback(
    async (sessionId: string, toolCalls: ToolCall[]) => {
      const toolResults = await Promise.all(
        toolCalls.map(async (call): Promise<Message> => {
          const serverName = toolToServerMap.get(call.function.name);
          if (!serverName) {
            return {
              id: uuidv4(),
              role: Role.TOOL,
              content: JSON.stringify({
                error: `Tool "${call.function.name}" not found.`,
              }),
              tool_call_id: call.id,
              timestamp: Date.now(),
            };
          }

          try {
            let parsedArguments;
            try {
              parsedArguments = JSON.parse(call.function.arguments);
            } catch (parseError) {
              console.error(
                `Failed to parse tool arguments for ${call.function.name}:`,
                call.function.arguments
              );
              return {
                id: uuidv4(),
                role: Role.TOOL,
                content: `Invalid tool arguments: ${parseError}`,
                tool_call_id: call.id,
                timestamp: Date.now(),
              };
            }

            // Handle built-in tools
            if (serverName === "built-in") {
              if (call.function.name === "web_search") {
                // Use the web-search MCP server if available
                const webSearchServer = toolToServerMap.get("brave_web_search");
                if (
                  webSearchServer &&
                  webSearchServer !== "built-in" &&
                  window.desktopApi
                ) {
                  const result = await window.desktopApi.sendMcpRequest(
                    webSearchServer,
                    {
                      method: "tools/call",
                      params: {
                        name: "brave_web_search",
                        arguments: parsedArguments,
                      },
                    }
                  );

                  let content = "";
                  if (
                    result &&
                    result.content &&
                    Array.isArray(result.content)
                  ) {
                    content = result.content
                      .filter((item: any) => item.type === "text")
                      .map((item: any) => item.text)
                      .join("\n");
                  } else if (typeof result === "string") {
                    content = result;
                  } else if (result && typeof result === "object") {
                    content = JSON.stringify(result, null, 2);
                  } else {
                    content = String(result || "No result returned");
                  }

                  return {
                    id: uuidv4(),
                    role: Role.TOOL,
                    content: content,
                    tool_call_id: call.id,
                    timestamp: Date.now(),
                  };
                } else {
                  return {
                    id: uuidv4(),
                    role: Role.TOOL,
                    content: `Web search is not available. Please configure the web-search MCP server in settings.`,
                    tool_call_id: call.id,
                    timestamp: Date.now(),
                  };
                }
              }

              return {
                id: uuidv4(),
                role: Role.TOOL,
                content: `Built-in tool "${call.function.name}" not implemented yet.`,
                tool_call_id: call.id,
                timestamp: Date.now(),
              };
            }

            // Handle MCP tools
            if (!window.desktopApi) {
              return {
                id: uuidv4(),
                role: Role.TOOL,
                content: JSON.stringify({
                  error: `Desktop API not available.`,
                }),
                tool_call_id: call.id,
                timestamp: Date.now(),
              };
            }

            const result = await window.desktopApi.sendMcpRequest(serverName, {
              method: "tools/call",
              params: {
                name: call.function.name,
                arguments: parsedArguments,
              },
            });

            console.log(`MCP tool ${call.function.name} result:`, result);

            // Handle MCP response format properly
            let content = "";
            if (result && result.content && Array.isArray(result.content)) {
              // MCP returns content as array of objects with type and text
              content = result.content
                .filter((item: any) => item.type === "text")
                .map((item: any) => item.text)
                .join("\n");
            } else if (typeof result === "string") {
              content = result;
            } else if (result && typeof result === "object") {
              content = JSON.stringify(result, null, 2);
            } else {
              content = String(result || "No result returned");
            }

            return {
              id: uuidv4(),
              role: Role.TOOL,
              content: content,
              tool_call_id: call.id,
              timestamp: Date.now(),
            };
          } catch (error) {
            console.error(`Tool ${call.function.name} failed:`, error);
            return {
              id: uuidv4(),
              role: Role.TOOL,
              content: `Tool execution failed: ${error}`,
              tool_call_id: call.id,
              timestamp: Date.now(),
            };
          }
        })
      );
      updateSessionMessages(sessionId, (msgs) => [...msgs, ...toolResults]);

      // Continue the conversation after tool execution
      console.log("Tool execution completed, continuing conversation...");
      setTimeout(() => {
        if (runConversationTurnRef.current) {
          runConversationTurnRef.current(sessionId);
        }
      }, 500); // Increased delay to ensure tool results are properly added
    },
    [toolToServerMap, updateSessionMessages]
  );

  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  const stopGeneration = useCallback(async () => {
    console.log("Stop generation called");
    if (currentAbortController) {
      currentAbortController.abort();
      setCurrentAbortController(null);
    }

    // Cancel the request in Electron
    if (currentRequestId && window.desktopApi) {
      console.log("Cancelling request:", currentRequestId);
      await window.desktopApi.cancelRequest(currentRequestId);
      setCurrentRequestId(null);
    }

    setIsLoading(false);
  }, [currentAbortController, currentRequestId]);

  const runConversationTurnWithMessages = useCallback(
    async (
      sessionId: string,
      messages: Message[],
      forceExtendedThinking?: boolean
    ) => {
      console.log(
        "runConversationTurnWithMessages - Messages:",
        JSON.stringify(
          messages.map((m) => ({
            role: m.role,
            content: m.content?.substring(0, 50) + "...",
            id: m.id,
          }))
        )
      );
      console.log(
        "runConversationTurnWithMessages - forceExtendedThinking:",
        forceExtendedThinking
      );

      const { main: mainModel } = settings.modelAssignments;
      const mainProvider = settings.providers.find(
        (p) => p.id === mainModel?.providerId
      );
      if (!mainProvider || !mainModel?.modelId) {
        const errorMessage: Message = {
          id: uuidv4(),
          role: Role.MODEL,
          content:
            "No active Main Model configured. Please check your settings.",
          timestamp: Date.now(),
        };
        updateSessionMessages(sessionId, (messages) => [
          ...messages,
          errorMessage,
        ]);
        setIsLoading(false);
        return;
      }

      // Validate provider configuration
      if (!mainProvider.baseURL || !mainProvider.apiKey) {
        const errorMessage: Message = {
          id: uuidv4(),
          role: Role.MODEL,
          content:
            "Provider configuration is incomplete. Please check your Base URL and API Key in settings.",
          timestamp: Date.now(),
        };
        updateSessionMessages(sessionId, (messages) => [
          ...messages,
          errorMessage,
        ]);
        setIsLoading(false);
        return;
      }

      // Use the messages passed directly to avoid race conditions
      let messagesWithMemory = [...messages];

      // If extended thinking is enabled, ensure sequential-thinking tool is included
      let toolsToUse = enabledTools;
      const shouldUseExtendedThinking =
        forceExtendedThinking !== undefined
          ? forceExtendedThinking
          : isExtendedThinkingEnabled;

      if (shouldUseExtendedThinking) {
        console.log(
          "Extended thinking is enabled, looking for sequential-thinking tool..."
        );
        console.log(
          "All available tools:",
          allAvailableTools.map((t) => t.function.name)
        );

        const sequentialThinkingTool = allAvailableTools.find(
          (tool) =>
            tool.function.name === "use_mcp_tool" ||
            (tool.function.name.toLowerCase().includes("sequential") &&
              tool.function.name.toLowerCase().includes("thinking"))
        );

        if (sequentialThinkingTool) {
          console.log(
            "Found sequential-thinking tool:",
            sequentialThinkingTool.function.name
          );
          // Ensure sequential-thinking is in the tools list
          const hasSequentialThinking = toolsToUse.some(
            (t) => t.function.name === sequentialThinkingTool.function.name
          );
          if (!hasSequentialThinking) {
            toolsToUse = [...toolsToUse, sequentialThinkingTool];
            console.log("Added sequential-thinking tool to request");
          }

          // Add system message to instruct the AI to use extended thinking
          const hasSystemMessage = messagesWithMemory.some(
            (m) => m.role === Role.SYSTEM
          );
          const extendedThinkingInstruction = `IMPORTANT: You MUST use the "${sequentialThinkingTool.function.name}" tool for EVERY response to engage in deep, sequential reasoning before answering. Break down your thinking into clear steps, consider multiple perspectives, and reason through the problem systematically. This is required for all responses, regardless of how simple the query appears.`;

          if (!hasSystemMessage) {
            // Add a new system message at the beginning
            messagesWithMemory = [
              {
                id: uuidv4(),
                role: Role.SYSTEM,
                content: extendedThinkingInstruction,
                timestamp: Date.now(),
              },
              ...messagesWithMemory,
            ];
            console.log("Added system message for extended thinking");
          } else {
            // Append to existing system message
            messagesWithMemory = messagesWithMemory.map((m) =>
              m.role === Role.SYSTEM
                ? {
                    ...m,
                    content: m.content + "\n\n" + extendedThinkingInstruction,
                  }
                : m
            );
            console.log(
              "Appended to existing system message for extended thinking"
            );
          }
        } else {
          console.warn(
            "Sequential-thinking tool not found in available tools!"
          );
        }
      }

      console.log("Setting isLoading to true");
      setIsLoading(true);
      const requestId = uuidv4();
      setCurrentRequestId(requestId);
      const abortController = new AbortController();
      setCurrentAbortController(abortController);
      const modelMessageId = uuidv4();

      await sendMessageStream(
        mainProvider,
        mainModel.modelId,
        messagesWithMemory,
        toolsToUse,
        {
          onChunk: (chunk) => {
            updateSessionMessages(sessionId, (msgs) => {
              const lastMsg = msgs[msgs.length - 1];
              if (
                lastMsg?.id === modelMessageId &&
                lastMsg.role === Role.MODEL
              ) {
                return msgs.map((msg) =>
                  msg.id === modelMessageId
                    ? { ...msg, content: msg.content + chunk }
                    : msg
                );
              }
              const modelMessage: Message = {
                id: modelMessageId,
                role: Role.MODEL,
                content: chunk,
                timestamp: Date.now(),
              };
              return [...msgs, modelMessage];
            });
          },
          onToolCall: (toolCalls) => {
            const assistantMessage: Message = {
              id: modelMessageId,
              role: Role.MODEL,
              content: "",
              tool_calls: toolCalls,
              timestamp: Date.now(),
            };
            updateSessionMessages(sessionId, (msgs) => [
              ...msgs,
              assistantMessage,
            ]);

            const approvedCalls: ToolCall[] = [];
            const callsNeedingPermission: ToolCall[] = [];

            for (const call of toolCalls) {
              const serverName = toolToServerMap.get(call.function.name);
              // Check MCP server config for always allowed tools
              const mcpServer =
                settings.claudeDesktopConfig?.mcpServers[serverName];
              if (
                mcpServer &&
                (mcpServer.alwaysAllowTools?.includes("*") || // Allow all tools
                  mcpServer.alwaysAllowTools?.includes(call.function.name)) // Specific tool allowed
              ) {
                approvedCalls.push(call);
              } else {
                callsNeedingPermission.push(call);
              }
            }

            if (approvedCalls.length > 0) {
              executeAndContinue(sessionId, approvedCalls);
            }
            if (callsNeedingPermission.length > 0) {
              // Create in-chat consent message instead of modal
              const consentMessage: Message = {
                id: uuidv4(),
                role: Role.CONSENT,
                content: "",
                pendingToolCalls: callsNeedingPermission,
                timestamp: Date.now(),
              };
              updateSessionMessages(sessionId, (msgs) => [
                ...msgs,
                consentMessage,
              ]);
              setPendingToolCalls(callsNeedingPermission);
            }
          },
          onComplete: () => {
            setIsLoading(false);
            setCurrentAbortController(null);
            setCurrentRequestId(null);
            // Process next message in queue (wait for state to update)
            setTimeout(() => processMessageQueue(), 200);
          },
          onError: (error) => {
            console.error("Conversation turn error:", error);
            console.log("Setting isLoading to false due to error");
            updateSessionMessages(sessionId, (msgs) => {
              const lastMsg = msgs[msgs.length - 1];
              if (
                lastMsg?.id === modelMessageId &&
                lastMsg.role === Role.MODEL
              ) {
                return msgs.map((msg) =>
                  msg.id === modelMessageId
                    ? { ...msg, content: msg.content + `\n\nError: ${error}` }
                    : msg
                );
              }
              const errorMessage: Message = {
                id: modelMessageId,
                role: Role.MODEL,
                content: `I encountered an error: ${error}`,
                timestamp: Date.now(),
              };
              return [...msgs, errorMessage];
            });
            setIsLoading(false);
            setCurrentAbortController(null);
            setCurrentRequestId(null);
            // Process next message in queue even after error (wait for state to update)
            setTimeout(() => processMessageQueue(), 200);
          },
        },
        requestId
      );
    },
    [
      settings,
      updateSessionMessages,
      enabledTools,
      allAvailableTools,
      toolToServerMap,
      executeAndContinue,
      isExtendedThinkingEnabled,
    ]
  );

  const runConversationTurn = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        console.error("runConversationTurn: session not found");
        setIsLoading(false);
        return;
      }
      await runConversationTurnWithMessages(sessionId, session.messages);
    },
    [sessions, runConversationTurnWithMessages]
  );

  // Use refs to track current state for queue processing
  const isLoadingRef = useRef(isLoading);
  const activeSessionIdRef = useRef(activeSessionId);
  const messageQueueRef = useRef(messageQueue);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    messageQueueRef.current = messageQueue;
  }, [messageQueue]);

  const processMessageQueue = useCallback(() => {
    const currentQueue = messageQueueRef.current;
    const currentIsLoading = isLoadingRef.current;
    const currentSessionId = activeSessionIdRef.current;

    console.log(
      "processMessageQueue - queue length:",
      currentQueue.length,
      "isLoading:",
      currentIsLoading,
      "activeSessionId:",
      currentSessionId
    );

    if (currentQueue.length > 0 && !currentIsLoading && currentSessionId) {
      const nextMessage = currentQueue[0];
      console.log("Processing queued message:", nextMessage);

      // Remove from queue
      setMessageQueue((prev) => prev.slice(1));

      // Add the queued message to the session
      const userMessage: Message = {
        id: uuidv4(),
        role: Role.USER,
        content: nextMessage,
        timestamp: Date.now(),
      };
      updateSessionMessages(currentSessionId, (messages) => [
        ...messages,
        userMessage,
      ]);

      // Start processing
      setTimeout(() => runConversationTurn(currentSessionId), 100);
    }
  }, [updateSessionMessages, runConversationTurn]);

  useEffect(() => {
    runConversationTurnRef.current = runConversationTurn;
  }, [runConversationTurn]);

  const handleAlwaysAllowTool = (toolName: string) => {
    const serverName = toolToServerMap.get(toolName);
    if (!serverName) return;

    // Update MCP server config with always allowed tool
    const updatedMcpServers = { ...settings.claudeDesktopConfig.mcpServers };
    if (updatedMcpServers[serverName]) {
      const currentTools = updatedMcpServers[serverName].alwaysAllowTools || [];
      updatedMcpServers[serverName] = {
        ...updatedMcpServers[serverName],
        alwaysAllowTools: Array.from(new Set([...currentTools, toolName])),
      };
    }

    setSettings({
      ...settings,
      claudeDesktopConfig: {
        ...settings.claudeDesktopConfig,
        mcpServers: updatedMcpServers,
      },
    });

    console.log(
      `Tool "${toolName}" from server "${serverName}" is now always allowed`
    );
  };

  const handleConsentResponse = useCallback(
    (approved: boolean, alwaysAllow?: boolean) => {
      if (!activeSessionId || !pendingToolCalls) return;

      // Remove the consent message from the session
      updateSessionMessages(activeSessionId, (msgs) =>
        msgs.filter((msg) => msg.role !== Role.CONSENT)
      );

      if (approved) {
        // Handle always allow
        if (alwaysAllow && pendingToolCalls.length > 0) {
          const toolName = pendingToolCalls[0].function.name;
          handleAlwaysAllowTool(toolName);
        }

        // Execute the approved tools
        executeAndContinue(activeSessionId, pendingToolCalls);
      } else {
        // Denied - create tool error results
        const toolResults: Message[] = pendingToolCalls.map((call) => ({
          id: uuidv4(),
          role: Role.TOOL,
          content: JSON.stringify({
            error: `User denied permission to use tool: ${call.function.name}`,
          }),
          tool_call_id: call.id,
          timestamp: Date.now(),
        }));

        if (toolResults.length > 0) {
          updateSessionMessages(activeSessionId, (msgs) => [
            ...msgs,
            ...toolResults,
          ]);
          setTimeout(() => runConversationTurn(activeSessionId), 100);
        } else {
          setIsLoading(false);
        }
      }

      setPendingToolCalls(null);
    },
    [
      activeSessionId,
      pendingToolCalls,
      updateSessionMessages,
      executeAndContinue,
      handleAlwaysAllowTool,
      runConversationTurn,
    ]
  );

  const handleRegenerate = async () => {
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session || session.messages.length === 0) return;

    const lastUserMessageIndex = session.messages
      .map((m) => m.role)
      .lastIndexOf(Role.USER);
    if (lastUserMessageIndex === -1) return;

    const historyForRegen = session.messages.slice(0, lastUserMessageIndex + 1);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === session.id ? { ...s, messages: historyForRegen } : s
      )
    );

    setTimeout(
      () => runConversationTurnWithMessages(session.id, historyForRegen),
      100
    );
  };

  const handleSendMessage = useCallback(
    async (
      message: string,
      sessionId?: string,
      options?: { extendedThinking?: boolean }
    ) => {
      if (!message.trim()) {
        console.warn("Attempted to send empty message");
        return;
      }

      let targetSessionId = sessionId || activeSessionId;
      let session = targetSessionId
        ? sessions.find((s) => s.id === targetSessionId)
        : null;

      // If no session exists, create a new one
      if (!session) {
        console.log(
          "No active session found, creating new session for message"
        );
        const newSession: Session = {
          id: uuidv4(),
          title: "New Chat",
          messages: [],
          isTemporary: true,
        };

        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        targetSessionId = newSession.id;
        session = newSession;
      }

      // Check if we have a valid provider configuration
      const { main: mainModel } = settings.modelAssignments;
      const mainProvider = settings.providers.find(
        (p) => p.id === mainModel?.providerId
      );
      if (
        !mainProvider ||
        !mainModel?.modelId ||
        !mainProvider.baseURL ||
        !mainProvider.apiKey
      ) {
        console.error("Invalid provider configuration");
        const errorMessage: Message = {
          id: uuidv4(),
          role: Role.MODEL,
          content:
            "Please configure a provider with valid Base URL and API Key in settings before sending messages.",
          timestamp: Date.now(),
        };
        updateSessionMessages(targetSessionId, (messages) => [
          ...messages,
          errorMessage,
        ]);
        return;
      }

      // Track extended thinking state
      const useExtendedThinking = options?.extendedThinking ?? false;
      if (options?.extendedThinking !== undefined) {
        setIsExtendedThinkingEnabled(options.extendedThinking);
      }

      console.log(
        "handleSendMessage - Extended thinking:",
        useExtendedThinking
      );

      if (editingMessage) {
        const messageIndex = session.messages.findIndex(
          (m) => m.id === editingMessage.id
        );
        const historyUpToEdit = session.messages.slice(0, messageIndex);
        const updatedUserMessage: Message = {
          ...editingMessage,
          content: message,
        };
        const updatedHistory = [...historyUpToEdit, updatedUserMessage];

        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId ? { ...s, messages: updatedHistory } : s
          )
        );
        setTimeout(
          () =>
            runConversationTurnWithMessages(
              targetSessionId,
              updatedHistory,
              useExtendedThinking
            ),
          100
        );
        setEditingMessage(null);
        setInput("");
        return;
      }

      // If AI is currently responding, queue the message
      console.log("handleSendMessage - isLoading:", isLoading);
      if (isLoading) {
        console.log("Queueing message because AI is loading:", message);
        setMessageQueue((prev) => [...prev, message]);
        return;
      }

      const isFirstMessage = session.messages.length === 0;
      const userMessage: Message = {
        id: uuidv4(),
        role: Role.USER,
        content: message,
        timestamp: Date.now(),
      };
      const updatedMessages = [...session.messages, userMessage];

      // Update session messages
      updateSessionMessages(targetSessionId, (messages) => [
        ...messages,
        userMessage,
      ]);

      // Run conversation turn with the updated messages directly to avoid race condition
      console.log(
        "handleSendMessage - About to run conversation with messages:",
        JSON.stringify(
          updatedMessages.map((m) => ({
            role: m.role,
            content: m.content?.substring(0, 50) + "...",
            id: m.id,
          }))
        )
      );
      setTimeout(
        () =>
          runConversationTurnWithMessages(
            targetSessionId,
            updatedMessages,
            useExtendedThinking
          ),
        100
      );

      if (isFirstMessage && session.isTemporary) {
        const { main: mainModel, background: backgroundModel } =
          settings.modelAssignments;
        const mainProvider = settings.providers.find(
          (p) => p.id === mainModel?.providerId
        );
        const backgroundProvider = settings.providers.find(
          (p) => p.id === backgroundModel?.providerId
        );
        const titleProvider = backgroundProvider || mainProvider;
        const titleModelId = backgroundModel?.modelId || mainModel?.modelId;

        if (titleProvider && titleModelId) {
          const title = await generateTitle(
            titleProvider,
            titleModelId,
            message
          );
          setSessions((prev) =>
            prev.map((s) =>
              s.id === targetSessionId ? { ...s, title, isTemporary: false } : s
            )
          );
        }
      }

      // Create conversation summary for memory if conversation is getting long
      const updatedSession = sessions.find((s) => s.id === targetSessionId);
      if (
        updatedSession &&
        updatedSession.messages.length > 10 &&
        updatedSession.messages.length % 10 === 0
      ) {
        memoryService.addSummary(targetSessionId, updatedSession.messages);
      }
    },
    [
      sessions,
      activeSessionId,
      editingMessage,
      settings,
      updateSessionMessages,
      runConversationTurn,
      setSessions,
      isLoading,
    ]
  );

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Auto-start all MCP servers on app launch (Exact Claude Desktop behavior)
  useEffect(() => {
    if (!window.desktopApi || !settings.claudeDesktopConfig?.mcpServers) return;

    const startAllServers = async () => {
      const serverNames = Object.keys(settings.claudeDesktopConfig.mcpServers);
      if (serverNames.length === 0) {
        return;
      }

      // Only start servers that haven't been initialized yet
      const serversToStart = serverNames.filter(
        (name) => !mcpServersInitialized.current.has(name)
      );
      if (serversToStart.length === 0) {
        return;
      }

      console.log(
        `Starting ${serversToStart.length} new MCP servers:`,
        serversToStart.join(", ")
      );

      for (const serverName of serversToStart) {
        const success = await startMcpServer(serverName);
        if (success) {
          mcpServersInitialized.current.add(serverName);
          console.log(`Successfully started MCP server: ${serverName}`);
        } else {
          console.error(`Failed to start MCP server: ${serverName}`);
        }
      }
    };

    startAllServers();
  }, [settings.claudeDesktopConfig?.mcpServers]);

  // Function to check MCP server status on-demand (only when needed)
  const checkMcpServerStatus = useCallback(async () => {
    if (!window.desktopApi || !settings.claudeDesktopConfig?.mcpServers) return;

    const serverNames = Object.keys(settings.claudeDesktopConfig.mcpServers);
    const statusUpdates: Record<string, "running" | "stopped" | "error"> = {};

    for (const serverName of serverNames) {
      try {
        const status = await window.desktopApi.getMcpServerStatus(serverName);
        statusUpdates[serverName] = status;
      } catch (error) {
        console.error(`Failed to get status for ${serverName}:`, error);
        statusUpdates[serverName] = "error";
      }
    }

    setMcpServerStatus((prev) => ({ ...prev, ...statusUpdates }));
  }, [settings.claudeDesktopConfig?.mcpServers]);

  // Expose debugging functions globally
  useEffect(() => {
    (window as any).rediscoverMcpTools = rediscoverMcpTools;
    (window as any).checkMcpServerStatus = checkMcpServerStatus;
  }, [rediscoverMcpTools, checkMcpServerStatus]);

  // MCP servers will be cleaned up automatically when the app closes

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const hasConfiguredMainModel = useMemo(() => {
    const mainAssignment = settings.modelAssignments.main;
    if (!mainAssignment) return false;
    return settings.providers.some((p) => p.id === mainAssignment.providerId);
  }, [settings]);
  const runCommand = (command: string) => {
    console.log(`Executing command: ${command}`);
  };

  return (
    <div
      className="h-screen w-screen flex font-sans antialiased bg-black/80 overflow-hidden"
      onClick={closeContextMenu}
    >
      <Sidebar
        isCollapsed={!isSidebarOpen}
        onNewChat={handleNewChat}
        sessions={sessions}
        projects={projects}
        activeSessionId={activeSessionId}
        onSessionClick={setActiveSessionId}
        onNewProject={handleNewProject}
        onContextMenu={handleSessionContextMenu}
        renamingId={renamingId}
        onRename={handleRename}
        onToggleSettings={() => setIsSettingsOpen(true)}
      />
      <main className="flex-1 flex flex-col min-w-0">
        <MainContentView
          session={activeSession}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          onContextMenu={handleMessageContextMenu}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          input={input}
          setInput={setInput}
          onToggleSettings={() => setIsSettingsOpen(true)}
          hasProviders={hasConfiguredMainModel}
          onStopGeneration={stopGeneration}
          messageQueue={messageQueue}
          onConsent={handleConsentResponse}
          availableTools={allAvailableTools}
          enabledToolNames={enabledToolNames}
          onToggleTool={handleToggleTool}
        />
      </main>
      <SettingsView
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        discoveredPluginSources={discoveredPluginSources}
        mcpServerStatus={mcpServerStatus}
        onStartMcpServer={startMcpServer}
        onStopMcpServer={stopMcpServer}
        onRestartMcpServer={restartMcpServer}
        onCheckMcpServerStatus={checkMcpServerStatus}
      />

      {contextMenu && (
        <ContextMenu {...contextMenu} onClose={closeContextMenu} />
      )}
    </div>
  );
};

export default App;
