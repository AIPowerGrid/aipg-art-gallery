import { getMediaFilename } from "../download";

describe("download utilities", () => {
  describe("getMediaFilename", () => {
    it("should generate filename for image without generation ID", () => {
      const filename = getMediaFilename("job-123", undefined, false);
      expect(filename).toBe("job-123.png");
    });

    it("should generate filename for video without generation ID", () => {
      const filename = getMediaFilename("job-123", undefined, true);
      expect(filename).toBe("job-123.mp4");
    });

    it("should generate filename for image with generation ID", () => {
      const filename = getMediaFilename("job-123", "gen-456", false);
      expect(filename).toBe("job-123_gen-456.png");
    });

    it("should generate filename for video with generation ID", () => {
      const filename = getMediaFilename("job-123", "gen-456", true);
      expect(filename).toBe("job-123_gen-456.mp4");
    });

    it("should handle empty job ID", () => {
      const filename = getMediaFilename("", undefined, false);
      expect(filename).toBe(".png");
    });

    it("should handle special characters in job ID", () => {
      const filename = getMediaFilename("job_123-abc", "gen_456", false);
      expect(filename).toBe("job_123-abc_gen_456.png");
    });
  });
});
