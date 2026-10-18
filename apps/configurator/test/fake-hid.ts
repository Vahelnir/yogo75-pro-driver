/** The few HIDDevice members the adapter uses; `sendReport` answers through `onReport`. */
export class FakeHidDevice extends EventTarget {
  productId: number;
  opened = false;
  sent: Uint8Array[] = [];
  onReport = (report: Uint8Array): Uint8Array[] => [report];

  constructor(productId: number) {
    super();
    this.productId = productId;
  }

  async open() {
    this.opened = true;
  }

  async sendReport(reportId: number, data: BufferSource) {
    if (reportId !== 0) {
      throw new Error(`report id ${reportId}`);
    }

    const report = new Uint8Array(data as ArrayBuffer);
    this.sent.push(report);
    for (const reply of this.onReport(report)) {
      this.emit(reply);
    }
  }

  emit(report: Uint8Array) {
    const data = new DataView(report.slice().buffer);
    this.dispatchEvent(
      Object.assign(new Event("inputreport"), { reportId: 0, data }),
    );
  }
}

export function asDevice(fake: FakeHidDevice): HIDDevice {
  return fake as unknown as HIDDevice;
}
