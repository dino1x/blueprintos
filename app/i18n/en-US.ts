const messages = {
  composer: {
    removeAttachment: "Remove {{name}}",
    removeReference: "Remove {{name}} reference",
  },
  settings: {
    title: "Settings",
    workspaceTitle: "Workspace",
    workspaceDescription:
      "Manage team members, organization access, and shared workspace preferences.",
    openTeamSettings: "Open team settings",
    openResourceSettings: "Open resource settings",
    agentTitle: "Manage agent",
    agentDescription:
      "Manage the agent's model, API keys, automations, voice, and other controls.",
    openAgentSettings: "Manage agent",
  },
  chat: {
    archiveChat: "Archive chat",
    archiveFailed: "Could not archive chat.",
    chats: "Chats",
    composerPlaceholder: "Ask about a sheet…",
    emptyState: "Ask about a sheet",
    heroDescription: "Ask the agent to audit a sheet, cite the code, or propose a redline. Only you can apply it or seal the drawing.",
    heroTitle: "Which clause fails?",
    inspectEmptyState: "Ask which clause fails, and what redline cures it.",
    inspectSuggestionAction: "Test the citation firewall",
    inspectSuggestionCapabilities: "Audit this sheet and rank the criticals",
    inspectSuggestionHello: "Propose a cited redline for the worst one",
    newChat: "New chat",
    optionsFor: "Chat options for {{title}}",
    pinChat: "Pin chat",
    pinned: "Pinned",
    recents: "Recents",
    retryPreviousRequest:
      "Retry my previous request now that the model provider is connected.",
    invalidHandoffOptions:
      "The prompt was saved as a draft, but its chat settings could not be restored. Review the prompt, context, and model before sending it again.",
    recoveryDraftUnsaved:
      "These draft changes aren't saved. Reloading this chat may lose them.",
    retryAttachmentUnavailable:
      "Chat can't reopen this attachment for retry. Add an accessible file URL, then retry.",
    renameChat: "Rename chat",
    renameFailed: "Could not rename chat.",
    renameThread: "Rename {{title}}",
    suggestionActions: "Show me the available actions",
    suggestionCapabilities: "What can this app do?",
    suggestionCustomize: "Help me customize this app",
    unpinChat: "Unpin chat",
    untitledChat: "Untitled chat",
  },
  home: {
    communityTitle: "Connect with us",
    docsAddAction: "Add an action",
    docsAddPage: "Add a page",
    docsGettingStarted: "Getting started",
    docsKeyConcepts: "Key concepts",
    docsTitle: "Documentation",
    title: "Get started",
  },
  navigation: {
    chat: "Chat",
    collapseSidebar: "Collapse sidebar",
    database: "Database",
    expandSidebar: "Expand sidebar",
    extensions: "Extensions",
    home: "Home",
    navigation: "Navigation",
    navigationDescription: "Main navigation",
    observability: "Observability",
    openNavigation: "Open navigation",
    settings: "Settings",
    team: "Team",
  },
  pages: {
    databaseTitle: "Database",
    observabilityPageTitle: "Agent observability",
    teamTitle: "Team",
    teamCreateOrgDescription:
      "Create an organization to invite teammates and share this app.",
  },
  root: {
    commandActions: "Actions",
    commandAppearance: "Appearance",
    commandSearch: "Search",
    toggleTheme: "Toggle theme",
  },
};

export default messages;
