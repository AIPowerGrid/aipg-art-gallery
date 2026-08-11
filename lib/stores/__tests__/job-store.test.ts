import { useJobStore, type TrackedJob } from "../job-store";

function job(
  owner: string,
  id: string,
  status: TrackedJob["status"],
): TrackedJob {
  return {
    jobId: id,
    modelId: "model",
    modelName: "Model",
    prompt: `prompt-${id}`,
    type: "image",
    isNsfw: false,
    isPublic: false,
    walletAddress: owner,
    submittedAt: Date.now(),
    status,
  };
}

describe("job-store identity partition", () => {
  beforeEach(() => {
    useJobStore.getState().stopPolling();
    useJobStore.setState({ jobs: [], activeOwner: null });
  });

  it("returns jobs only for the selected local identity", () => {
    useJobStore.getState().setActiveOwner("google:user-a");
    useJobStore.setState({
      jobs: [
        job("google:user-a", "a-active", "processing"),
        job("google:user-b", "b-active", "processing"),
        job("google:user-a", "a-done", "completed"),
        job("google:user-b", "b-done", "completed"),
      ],
    });

    expect(
      useJobStore
        .getState()
        .getActiveJobs()
        .map((item) => item.jobId),
    ).toEqual(["a-active"]);
    expect(
      useJobStore
        .getState()
        .getCompletedJobs()
        .map((item) => item.jobId),
    ).toEqual(["a-done"]);
  });

  it("returns no persisted jobs without an authenticated owner", () => {
    useJobStore.setState({ jobs: [job("google:user-a", "a", "completed")] });
    expect(useJobStore.getState().getCompletedJobs()).toEqual([]);
  });

  it("moves only proven legacy jobs to the canonical account", () => {
    useJobStore.setState({
      jobs: [
        job("google:user-a", "google-job", "completed"),
        job("0xwallet-a", "wallet-job", "completed"),
        job("google:user-b", "foreign-job", "completed"),
      ],
    });

    useJobStore
      .getState()
      .setActiveOwner("account-123", ["google:user-a", "0xwallet-a"]);

    const jobs = useJobStore.getState().jobs;
    expect(
      jobs.find((item) => item.jobId === "google-job")?.walletAddress,
    ).toBe("account-123");
    expect(
      jobs.find((item) => item.jobId === "wallet-job")?.walletAddress,
    ).toBe("account-123");
    expect(
      jobs.find((item) => item.jobId === "foreign-job")?.walletAddress,
    ).toBe("google:user-b");
  });
});
