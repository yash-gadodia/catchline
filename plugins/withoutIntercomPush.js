const { withInfoPlist } = require('expo/config-plugins');

// The Intercom plugin always adds the remote-notification background mode; Intercom push is not wired yet.
module.exports = (config) =>
  withInfoPlist(config, (c) => {
    const modes = (c.modResults.UIBackgroundModes ?? []).filter((m) => m !== 'remote-notification');
    if (modes.length) c.modResults.UIBackgroundModes = modes;
    else delete c.modResults.UIBackgroundModes;
    return c;
  });
