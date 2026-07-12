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
});
