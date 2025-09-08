# This dockerfile installs some parts of the claude code devcontainer: https://github.com/anthropics/claude-code/blob/main/.devcontainer/Dockerfile
# And we install tmux and postgres client

FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm

# Install additional system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    jq \
    less \
    unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*


# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin


# Install Claude Code globally with proper permissions
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Create Claude config directories with proper permissions
RUN mkdir -p /home/node/.claude /home/node/.config/claude && \
    chown -R node:node /home/node/.claude /home/node/.config/claude

# Switch back to the node user
USER node