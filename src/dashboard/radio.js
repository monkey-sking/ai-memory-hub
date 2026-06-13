export function createDashboardRadioApi({ readRadioMessages }) {
  function getDashboardRadio(memoryDir) {
    return {
      messages: readRadioMessages(memoryDir).slice(-50)
    };
  }

  return {
    getDashboardRadio
  };
}
