import { DVault, NoteProps } from "@dendronhq/common-all";
import { tmpDir } from "@dendronhq/common-server";
import { NoteTestUtilsV4 } from "@dendronhq/common-test-utils";
import { DConfig, WorkspaceService } from "@dendronhq/engine-server";
import fs from "fs-extra";
import path from "path";
import { TestConfigUtils } from "../../config";
import { runEngineTestV5, setupWS, testWithEngine } from "../../engine";
import { ENGINE_HOOKS } from "../../presets";
import { checkVaults, GitTestUtils } from "../../utils";

describe("WorkspaceService", () => {
  describe("create", () => {
    test("basic", async () => {
      const wsRoot = tmpDir().name;
      const vaults = [{ fsPath: "vault1" }];
      await WorkspaceService.createWorkspace({ wsRoot, vaults });
      const gitignore = path.join(wsRoot, ".gitignore");
      expect(
        fs.readFileSync(gitignore, { encoding: "utf8" })
      ).toMatchSnapshot();
    });

    test("workspace Vault", async () => {
      const wsRoot = tmpDir().name;
      const vaults: DVault[] = [{ fsPath: "vault1", workspace: "foo" }];
      await WorkspaceService.createWorkspace({ wsRoot, vaults });
      expect(fs.existsSync(path.join(wsRoot, "foo", "vault1"))).toBeTruthy();
    });
  });

  describe("initialize", () => {
    testWithEngine("remoteVaults present", async ({ wsRoot, engine }) => {
      const root = tmpDir().name;
      await GitTestUtils.createRepoWithReadme(root);

      engine.config.vaults.push({
        fsPath: "remoteVault",
        remote: {
          type: "git",
          url: root,
        },
      });
      DConfig.writeConfig({ wsRoot, config: engine.config });

      const ws = new WorkspaceService({ wsRoot });
      const didClone = await ws.initialize({
        onSyncVaultsProgress: () => {},
        onSyncVaultsEnd: () => {},
      });
      expect(didClone).toEqual(true);
      expect(
        fs.existsSync(path.join(wsRoot, "remoteVault", "README.md"))
      ).toBeTruthy();
    });

    test("remote workspace present", async () => {
      await runEngineTestV5(
        async ({ wsRoot, vaults }) => {
          const { wsRoot: remoteDir } = await setupWS({
            vaults: [{ fsPath: "vault1" }],
            asRemote: true,
          });
          TestConfigUtils.withConfig(
            (config) => {
              config.workspaces = {
                remoteVault: {
                  remote: {
                    type: "git",
                    url: remoteDir,
                  },
                },
              };
              return config;
            },
            { wsRoot }
          );
          await new WorkspaceService({ wsRoot }).addVault({
            vault: { fsPath: "vault1", workspace: "remoteVault" },
            addToWorkspace: true,
            writeConfig: true,
          });
          const ws = new WorkspaceService({ wsRoot });
          const didClone = await ws.initialize({
            onSyncVaultsProgress: () => {},
            onSyncVaultsEnd: () => {},
          });
          expect(didClone).toEqual(true);
          expect(
            fs.existsSync(path.join(wsRoot, "remoteVault", "vault1", "root.md"))
          ).toBeTruthy();
          checkVaults(
            {
              wsRoot,
              vaults: [
                {
                  fsPath: "vault1",
                  workspace: "remoteVault",
                } as DVault,
              ].concat(vaults),
            },
            expect
          );
        },
        {
          expect,
          preSetupHook: async (opts) => {
            await ENGINE_HOOKS.setupBasic(opts);
          },
          addVSWorkspace: true,
        }
      );
    });

    // testWithEngine(
    //   "remoteVaults present as workspace vault",
    //   async ({ wsRoot, engine }) => {
    //     const {wsRoot: wsRootRemote} = await runEngineTestV5(async ()=>{}, {
    //       vaults: [{
    //         fsPath: "gamma"
    //       }],
    //       expect, setupOnly: true, initGit: true})

    //     engine.config.vaults.push({
    //       fsPath: "repos/gamma",
    //       remote: {
    //         type: "git",
    //         url: wsRootRemote,
    //       },
    //     });
    //     DConfig.writeConfig({ wsRoot, config: engine.config });
    //     expect(engine.config).toMatchSnapshot();
    //     const ws = new WorkspaceService({ wsRoot });
    //     const didClone = await ws.initialize({
    //       onSyncVaultsProgress: () => { },
    //       onSyncVaultsEnd: () => { },
    //     });
    //     expect(didClone).toEqual(true);
    //     expect(
    //       fs.existsSync(path.join(wsRoot, "repos", "gamma", "dendron.yml"))
    //     ).toBeTruthy();
    //   }, {only: true }
    // );

    testWithEngine(
      "remoteVaults present, no initializeRemoteVaults",
      async ({ wsRoot, engine }) => {
        const root = tmpDir().name;
        await GitTestUtils.createRepoWithReadme(root);

        engine.config.vaults.push({
          fsPath: "remoteVault",
          remote: {
            type: "git",
            url: root,
          },
        });
        engine.config.initializeRemoteVaults = false;
        DConfig.writeConfig({ wsRoot, config: engine.config });
        const ws = new WorkspaceService({ wsRoot });
        const didClone = await ws.initialize({
          onSyncVaultsProgress: () => {},
          onSyncVaultsEnd: () => {},
        });
        expect(didClone).toBeFalsy();
        expect(
          fs.existsSync(path.join(wsRoot, "remoteVault", "README.md"))
        ).toBeFalsy();
      }
    );
  });

  testWithEngine(
    "commitAll",
    async ({ wsRoot, vaults }) => {
      await NoteTestUtilsV4.modifyNoteByPath(
        { wsRoot, vault: vaults[0], fname: "foo" },
        (note: NoteProps) => {
          note.body = note.body + "\n Foo";
          return note;
        }
      );
      await NoteTestUtilsV4.createNote({
        fname: "bar",
        vault: vaults[1],
        wsRoot,
      });
      const resp = await new WorkspaceService({
        wsRoot,
      }).commidAndAddAll();
      expect(resp.length).toEqual(2);
    },
    { initGit: true }
  );
});
