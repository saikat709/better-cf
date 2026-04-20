let latestOpenState = false;
let latestAllowedState = true;

const setLatestOpenState = (value: boolean) => {
  latestOpenState = value;
};

const setLatestAllowedState = (value: boolean) => {
  latestAllowedState = value;
};

const getLatestOpenState = () => latestOpenState;
const getLatestAllowedState = () => latestAllowedState;

export { getLatestAllowedState, getLatestOpenState, setLatestAllowedState, setLatestOpenState };
