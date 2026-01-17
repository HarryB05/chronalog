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
 * Batch fetches multiple file contents in a single GraphQL query
 * This is much more efficient than fetching files individually
 * @param client GraphQL client with authentication
 * @param owner Repository owner
 * @param name Repository name
 * @param filePaths Array of file paths to fetch
 * @param branch Branch name (default: 'main')
 * @returns Map of file path to file content (or null if not found)
 */
export async function getMultipleFileContents(
  client: GraphQLClient,
  owner: string,
  name: string,
  filePaths: string[],
  branch: string = 'main'
): Promise<Map<string, string | null>> {
  if (filePaths.length === 0) {
    return new Map()
  }

  // GitHub GraphQL API has query complexity limits
  // We'll batch files in chunks of 50 to avoid hitting limits
  const BATCH_SIZE = 50
  const batches: string[][] = []
  
  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    batches.push(filePaths.slice(i, i + BATCH_SIZE))
  }

  const allResults = new Map<string, string | null>()

  // Process each batch
  for (const batch of batches) {
    // Build GraphQL query with aliases for each file
    // Note: We use string interpolation for expressions since GraphQL aliases must be static
    // The branch and path values are safe as they come from our controlled inputs
    const queries = batch.map((path, index) => {
      const alias = `file${index}`
      // Construct the expression: branch:path
      // Escape any special characters in the path for GraphQL
      const escapedPath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const expression = `${branch}:${escapedPath}`
      return `
      ${alias}: repository(owner: $owner, name: $name) {
        object(expression: "${expression}") {
          ... on Blob {
            text
          }
        }
      }
    `
    }).join('\n')

    const query = `
      query GetMultipleFiles($owner: String!, $name: String!) {
        ${queries}
      }
    `

    try {
      const data = await client.request<Record<string, { object: { text: string } | null }>>(
        query,
        { owner, name }
      )

      // Map results back to file paths
      batch.forEach((path, index) => {
        const alias = `file${index}`
        const fileData = data[alias]
        allResults.set(path, fileData?.object?.text || null)
      })
    } catch (error) {
      console.error('[Chronalog] Error batch fetching files:', error)
      // On error, set all files in batch to null
      batch.forEach((path) => {
        allResults.set(path, null)
      })
    }
  }

  return allResults
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
