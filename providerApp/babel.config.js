module.exports = function (api) {
    api.cache(true);
    return {
      presets: ['babel-preset-expo'],
      plugins: [
        // ONLY use this — let Reanimated handle worklets
        'react-native-reanimated/plugin',
      ],
    };
  };
  