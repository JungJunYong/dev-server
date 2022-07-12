module.exports = {
    parser: '@typescript-eslint/parser',
    // eslint-disable-next-line prettier/prettier
    extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint', 'plugin:prettier/recommended'],
    parserOptions: {
        ecmaVersion: 2019,
        sourceType: 'module'
    },
    rules: {
        '@typescript-eslint/explicit-function-return-type': 'off'
    },
    ignorePatterns: ['server/**/*.js'],
    env: {
        node: true
    }
};
