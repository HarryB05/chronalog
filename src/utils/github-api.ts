import { GraphQLClient } from 'graphql-request'
import { encode as toBase64 } from 'js-base64'

const GITHUB_GQL_API_URL = 'https://api.github.com/graphql'

/**
 * Creates a GraphQL client for GitHub API
 */
export function createGitHubClient(accessToken: string): GraphQLClient {
  return new GraphQLClient(GITHUB_GQL_API_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })
}

/**
 * Gets the current branch OID (commit SHA)
 */
export async function getBranchOid(
  client: GraphQLClient,
  owner: string,
  name: string,
  branch: string = 'main'
): Promise<string> {
  const query = `
    query GetBranchOid($owner: String!, $name: String!, $branch: String!) {
      repository(owner: $owner, name: $name) {
        ref(qualifiedName: $branch) {
          target {
            oid
          }
        }
      }
    }
  `

  const data = await client.request<{
    repository: {
      ref: {
        target: {
          oid: string
        }
      } | null
    }
  }>(query, { owner, name, branch })

  if (!data.repository?.ref?.target) {
    throw new Error(`Branch ${branch} not found`)
  }

  return data.repository.ref.target.oid
}

/**
 * Gets file content from GitHub
 */
export async function getFileContent(
  client: GraphQLClient,
  owner: string,
  name: string,
  filePath: string,
  branch: string = 'main'
): Promise<string | null> {
  const query = `
    query GetFile($owner: String!, $name: String!, $filePath: String!) {
      repository(owner: $owner, name: $name) {
        object(expression: $filePath) {
          ... on Blob {
            text
          }
        }
      }
    }
  `

  try {
    const data = await client.request<{
      repository: {
        object: {
          text: string
        } | null
      }
    }>(query, {
      owner,
      name,
      filePath: `${branch}:${filePath}`,
    })

    return data.repository?.object?.text || null
  } catch (error) {
    return null
  }
}

/**
 * Lists files in a directory
 */
export async function listFiles(
  client: GraphQLClient,
  owner: string,
  name: string,
  path: string,
  branch: string = 'main'
): Promise<Array<{ path: string; name: string; type: string }>> {
  const query = `
    query ListFiles($owner: String!, $name: String!, $contentPath: String!) {
      repository(owner: $owner, name: $name) {
        object(expression: $contentPath) {
          ... on Tree {
            entries {
              path
              name
              type
            }
          }
        }
      }
    }
  `

  try {
    const data = await client.request<{
      repository: {
        object: {
          entries: Array<{
            path: string
            name: string
            type: string
          }>
        } | null
      }
    }>(query, {
      owner,
      name,
      contentPath: `${branch}:${path}`,
    })

    return data.repository?.object?.entries || []
  } catch (error) {
    return []
  }
}

/**
 * Creates a commit with file changes
 */
export async function createCommit(
  client: GraphQLClient,
  owner: string,
  name: string,
  branch: string,
  oid: string,
  message: string,
  additions: Array<{ path: string; contents: string }>,
  deletions: Array<{ path: string }> = []
): Promise<string> {
  const mutation = `
    mutation CreateCommit($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) {
        commit {
          oid
        }
      }
    }
  `

  const input = {
    branch: {
      repositoryNameWithOwner: `${owner}/${name}`,
      branchName: branch,
    },
    message: {
      headline: message,
    },
    fileChanges: {
      additions: additions.map((add) => ({
        path: add.path,
        contents: add.contents,
      })),
      deletions: deletions.map((del) => ({
        path: del.path,
      })),
    },
    expectedHeadOid: oid,
  }

  const data = await client.request<{
    createCommitOnBranch: {
      commit: {
        oid: string
      }
    }
  }>(mutation, { input })

  return data.createCommitOnBranch.commit.oid
}

/**
 * Helper to create a commit API similar to Outstatic
 */
export interface CommitAPI {
  setMessage: (title: string, body?: string) => void
  replaceFile: (file: string, contents: string, encode?: boolean) => void
  removeFile: (file: string) => void
  createInput: () => {
    branch: {
      repositoryNameWithOwner: string
      branchName: string
    }
    message: {
      headline: string
    }
    fileChanges: {
      additions: Array<{ path: string; contents: string }>
      deletions: Array<{ path: string }>
    }
    expectedHeadOid: string
  }
}

export function createCommitApi({
  message,
  owner,
  oid,
  name,
  branch,
}: {
  message: string
  owner: string
  oid: string
  name: string
  branch: string
}): CommitAPI {
  const additions: Array<{ path: string; contents: string }> = []
  const deletions: Array<{ path: string }> = []
  let commitMessage = message ?? 'chore: Chronalog commit'
  let commitBody = 'Automatically created by Chronalog'

  const setMessage = (title: string, body?: string) => {
    commitMessage = title ?? commitMessage
    commitBody = body ?? commitBody
  }

  const replaceFile = (file: string, contents: string, encode = true) => {
    const encoded = encode === true ? toBase64(contents) : contents
    additions.push({ path: file, contents: encoded })
  }

  const removeFile = (file: string) => {
    deletions.push({ path: file })
  }

  const createInput = () => {
    return {
      branch: {
        repositoryNameWithOwner: `${owner}/${name}`,
        branchName: branch,
      },
      message: {
        headline: commitMessage,
      },
      fileChanges: {
        additions,
        deletions,
      },
      expectedHeadOid: oid,
    }
  }

  return { setMessage, createInput, replaceFile, removeFile }
}
