package executor

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
)

// ComplexContract bytecode (compiled from ComplexContract.sol)
const complexContractBytecode = "6080604052348015600e575f5ffd5b5060405161288a38038061288a8339818101604052810190602e919060ab565b335f5f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550806001819055505060d1565b5f5ffd5b5f819050919050565b608d81607d565b81146096575f5ffd5b50565b5f8151905060a5816086565b92915050565b5f6020828403121560bd5760bc6079565b5b5f60c8848285016099565b91505092915050565b6127ac806100de5f395ff3fe608060405260043610610211575f3560e01c80638da5cb5b11610117578063c010fff71161009f578063e66ef92d1161006e578063e66ef92d1461088c578063ebb00796146108c8578063f2fde38b14610905578063f3d4e5621461092d578063fce680231461095757610212565b8063c010fff7146107c0578063c04f01fc146107e8578063c59d484714610824578063d39fa2331461085057610212565b8063a87d942c116100e6578063a87d942c146106a2578063aee24bcc146106cc578063b2745e4214610708578063b3c33f2f14610747578063bdb75d621461078357610212565b80638da5cb5b146105c15780639ee20b15146105eb578063a214547f14610627578063a87430ba1461066357610212565b806361bc221a1161019a57806373b8f4fe1161016957806373b8f4fe146104a95780637a873b24146104e55780637ae2b5c71461050d57806383714834146105495780638d944fd91461058557610212565b806361bc221a146103d95780636d5433e6146104035780636f9fb98a1461043f5780637195e1cd1461046957610212565b80635129f097116101e15780635129f097146102e1578063561597b31461031d578063569407121461035a5780635b34b966146103845780635e878508146103ae57610212565b8062819439146102145780631a47767b1461024157806327e7e0561461026957806347734892146102a557610212565b5b005b34801561021f575f5ffd5b5061022861097f565b6040516102389493929190611787565b60405180910390f35b34801561024c575f5ffd5b5061026760048036038101906102629190611805565b610995565b005b348015610274575f5ffd5b5061028f600480360381019061028a919061185a565b610a7d565b60405161029c91906118f5565b60405180910390f35b3480156102b0575f5ffd5b506102cb60048036038101906102c69190611805565b610b49565b6040516102d89190611915565b60405180910390f35b3480156102ec575f5ffd5b506103076004803603810190610302919061185a565b610b92565b6040516103149190611915565b60405180910390f35b348015610328575f5ffd5b50610343600480360381019061033e919061192e565b610c79565b60405161035192919061196c565b60405180910390f35b348015610365575f5ffd5b5061036e610c8e565b60405161037b9190611915565b60405180910390f35b34801561038f575f5ffd5b50610398610ce4565b6040516103a59190611915565b60405180910390f35b3480156103b9575f5ffd5b506103c2610d46565b6040516103d0929190611993565b60405180910390f35b3480156103e4575f5ffd5b506103ed610d52565b6040516103fa9190611915565b60405180910390f35b34801561040e575f5ffd5b506104296004803603810190610424919061192e565b610d58565b6040516104369190611915565b60405180910390f35b34801561044a575f5ffd5b50610453610d70565b6040516104609190611915565b60405180910390f35b348015610474575f5ffd5b5061048f600480360381019061048a91906119ed565b610d77565b6040516104a0959493929190611a45565b60405180910390f35b3480156104b4575f5ffd5b506104cf60048036038101906104ca9190611acb565b610d9f565b6040516104dc9190611b05565b60405180910390f35b3480156104f0575f5ffd5b5061050b60048036038101906105069190611c4a565b610daa565b005b348015610518575f5ffd5b50610533600480360381019061052e919061192e565b610f39565b6040516105409190611915565b60405180910390f35b348015610554575f5ffd5b5061056f600480360381019061056a919061185a565b610f51565b60405161057c9190611915565b60405180910390f35b348015610590575f5ffd5b506105ab60048036038101906105a69190611cca565b610fe5565b6040516105b89190611d08565b60405180910390f35b3480156105cc575f5ffd5b506105d5611047565b6040516105e29190611d21565b60405180910390f35b3480156105f6575f5ffd5b50610611600480360381019061060c9190611805565b61106b565b60405161061e9190611d08565b60405180910390f35b348015610632575f5ffd5b5061064d6004803603810190610648919061192e565b6110c0565b60405161065a9190611915565b60405180910390f35b34801561066e575f5ffd5b5061068960048036038101906106849190611805565b611140565b6040516106999493929190611d3a565b60405180910390f35b3480156106ad575f5ffd5b506106b66111fe565b6040516106c39190611915565b60405180910390f35b3480156106d7575f5ffd5b506106f260048036038101906106ed9190611db7565b611207565b6040516106ff9190611e2f565b60405180910390f35b348015610713575f5ffd5b5061072e6004803603810190610729919061192e565b61126a565b60405161073e9493929190611e48565b60405180910390f35b348015610752575f5ffd5b5061076d60048036038101906107689190611cca565b61128a565b60405161077a9190611d08565b60405180910390f35b34801561078e575f5ffd5b506107a960048036038101906107a49190611e8b565b6112b4565b6040516107b792919061196c565b60405180910390f35b3480156107cb575f5ffd5b506107e660048036038101906107e19190611f05565b611328565b005b3480156107f3575f5ffd5b5061080e6004803603810190610809919061192e565b61141e565b60405161081b9190611915565b60405180910390f35b34801561082f575f5ffd5b50610838611468565b60405161084793929190611f55565b60405180910390f35b34801561085b575f5ffd5b506108766004803603810190610871919061185a565b6114a0565b6040516108839190611915565b60405180910390f35b348015610897575f5ffd5b506108b260048036038101906108ad9190612028565b6114c0565b6040516108bf919061207e565b60405180910390f35b3480156108d3575f5ffd5b506108ee60048036038101906108e99190611805565b6114d0565b6040516108fc92919061196c565b60405180910390f35b348015610910575f5ffd5b5061092b60048036038101906109269190611805565b6114f5565b005b348015610938575f5ffd5b506109416116b2565b60405161094e9190611915565b60405180910390f35b348015610962575f5ffd5b5061097d6004803603810190610978919061185a565b6116be565b005b5f5f5f5f43935042925045915041905090919293565b5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610a23576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a1a906120e1565b60405180910390fd5b5f60035f8373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f206003015f6101000a81548160ff02191690831515021790555050565b6060600a821015610ac5576040518060400160405280600581526020017f736d616c6c0000000000000000000000000000000000000000000000000000008152509050610b44565b6064821015610b0b576040518060400160405280600681526020017f6d656469756d00000000000000000000000000000000000000000000000000008152509050610b44565b6040518060400160405280600581526020017f6c6172676500000000000000000000000000000000000000000000000000000081525090505b919050565b5f60035f8373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20600201549050919050565b5f5f600a67ffffffffffffffff811115610baf57610bae611b26565b5b604051908082528060200260200182016040528015610bdd5781602001602082028036833780820191505090505b5090505f5f90505b600a811015610c26578084610bfa919061212c565b828281518110610c0d57610c0c61215f565b5b6020026020010181815250508080600101915050610be5565b505f5f90505f5f90505b600a811015610c6e57828181518110610c4c57610c4b61215f565b5b602002602001015182610c5f919061212c565b91508080600101915050610c30565b508092505050919050565b5f5f8284901b91508284901c90509250929050565b5f5f5f90505f5f90505b600280549050811015610cdc5760028181548110610cb957610cb861215f565b5b905f5260205f20015482610ccd919061212c565b91508080600101915050610c98565b508091505090565b5f5f600154905060015f815480929190610cfd9061218c565b91905055507ff6ef72180c46cadbda80997bfa03fc39b76911c9bc988da15e4a47d55d687a3181600154604051610d3592919061196c565b60405180910390a160015491505090565b5f5f3291503a90509091565b60015481565b5f818311610d665781610d68565b825b905092915050565b5f47905090565b5f5f5f5f5f858712945085871393508587149250858712915085871390509295509295909350565b5f815f0b9050919050565b5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610e38576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610e2f906120e1565b60405180910390fd5b60405180608001604052808481526020018381526020018281526020016001151581525060035f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f820151815f01556020820151816001019081610eb691906123d0565b50604082015181600201556060820151816003015f6101000a81548160ff0219169083151502179055509050508373ffffffffffffffffffffffffffffffffffffffff167f8795f5783702656c6cf8e922e563818a13a014bd843d4ec354268e0712564d2d8484604051610f2b92919061249f565b60405180910390a250505050565b5f818310610f475781610f49565b825b905092915050565b5f6014821115610f96576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610f8d90612517565b60405180910390fd5b60018211610fa75760019050610fe0565b5f600190505f600290505b838111610fda578082610fc59190612535565b91508080610fd29061218c565b915050610fb2565b81925050505b919050565b5f60045f8473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8381526020019081526020015f205f9054906101000a900460ff16905092915050565b5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f60035f8373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f206003015f9054906101000a900460ff169050919050565b5f82821015611104576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016110fb906125c0565b60405180910390fd5b5f5f90505f8490505b838111611135578082611120919061212c565b9150808061112d9061218c565b91505061110d565b508091505092915050565b6003602052805f5260405f205f91509050805f01549080600101805461116590612200565b80601f016020809104026020016040519081016040528092919081815260200182805461119190612200565b80156111dc5780601f106111b3576101008083540402835291602001916111dc565b820191905f5260205f20905b8154815290600101906020018083116111bf57829003601f168201915b505050505090806002015490806003015f9054906101000a900460ff16905084565b5f600154905090565b5f6020821061124b576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161124290612628565b60405180910390fd5b82826020811061125e5761125d61215f565b5b1a60f81b905092915050565b5f5f5f5f8486169350848617925084861891508519905092959194509250565b6004602052815f5260405f20602052805f5260405f205f915091509054906101000a900460ff1681565b5f5f5f83116112f8576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016112ef90612690565b60405180910390fd5b8280611307576113066126ae565b5b8486089150828061131b5761131a6126ae565b5b8486099050935093915050565b5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146113b6576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016113ad906120e1565b60405180910390fd5b8060045f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8481526020019081526020015f205f6101000a81548160ff021916908315150217905550505050565b5f5f820361142f5760019050611462565b5f600190505f5f90505b8381101561145c57848261144d9190612535565b91508080600101915050611439565b50809150505b92915050565b5f5f5f600154925060028054905091505f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050909192565b600281815481106114af575f80fd5b905f5260205f20015f915090505481565b5f81805190602001209050919050565b5f5f8273ffffffffffffffffffffffffffffffffffffffff16319150823b9050915091565b5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614611583576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161157a906120e1565b60405180910390fd5b5f73ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16036115f1576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016115e890612725565b60405180910390fd5b5f5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050815f5f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a35050565b5f600280549050905090565b600281908060018154018082558091505060019003905f5260205f20015f909190919091505560016002805490506116f69190612743565b7f3953975296e80fadd8df493e1e04b0cf0360a89eaf91ce2195c2a48feeb7579d826040516117259190611915565b60405180910390a250565b5f819050919050565b61174281611730565b82525050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61177182611748565b9050919050565b61178181611767565b82525050565b5f60808201905061179a5f830187611739565b6117a76020830186611739565b6117b46040830185611739565b6117c16060830184611778565b95945050505050565b5f604051905090565b5f5ffd5b5f5ffd5b6117e481611767565b81146117ee575f5ffd5b50565b5f813590506117ff816117db565b92915050565b5f6020828403121561181a576118196117d3565b5b5f611827848285016117f1565b91505092915050565b61183981611730565b8114611843575f5ffd5b50565b5f8135905061185481611830565b92915050565b5f6020828403121561186f5761186e6117d3565b5b5f61187c84828501611846565b91505092915050565b5f81519050919050565b5f82825260208201905092915050565b8281835e5f83830152505050565b5f601f19601f8301169050919050565b5f6118c782611885565b6118d1818561188f565b93506118e181856020860161189f565b6118ea816118ad565b840191505092915050565b5f6020820190508181035f83015261190d81846118bd565b905092915050565b5f6020820190506119285f830184611739565b92915050565b5f5f60408385031215611944576119436117d3565b5b5f61195185828601611846565b925050602061196285828601611846565b9150509250929050565b5f60408201905061197f5f830185611739565b61198c6020830184611739565b9392505050565b5f6040820190506119a65f830185611778565b6119b36020830184611739565b9392505050565b5f819050919050565b6119cc816119ba565b81146119d6575f5ffd5b50565b5f813590506119e7816119c3565b92915050565b5f5f60408385031215611a0357611a026117d3565b5b5f611a10858286016119d9565b9250506020611a21858286016119d9565b9150509250929050565b5f8115159050919050565b611a3f81611a2b565b82525050565b5f60a082019050611a585f830188611a36565b611a656020830187611a36565b611a726040830186611a36565b611a7f6060830185611a36565b611a8c6080830184611a36565b9695505050505050565b5f815f0b9050919050565b611aaa81611a96565b8114611ab4575f5ffd5b50565b5f81359050611ac581611aa1565b92915050565b5f60208284031215611ae057611adf6117d3565b5b5f611aed84828501611ab7565b91505092915050565b611aff816119ba565b82525050565b5f602082019050611b185f830184611af6565b92915050565b5f5ffd5b5f5ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b611b5c826118ad565b810181811067ffffffffffffffff82111715611b7b57611b7a611b26565b5b80604052505050565b5f611b8d6117ca565b9050611b998282611b53565b919050565b5f67ffffffffffffffff821115611bb857611bb7611b26565b5b611bc1826118ad565b9050602081019050919050565b828183375f83830152505050565b5f611bee611be984611b9e565b611b84565b905082815260208101848484011115611c0a57611c09611b22565b5b611c15848285611bce565b509392505050565b5f82601f830112611c3157611c30611b1e565b5b8135611c41848260208601611bdc565b91505092915050565b5f5f5f5f60808587031215611c6257611c616117d3565b5b5f611c6f878288016117f1565b9450506020611c8087828801611846565b935050604085013567ffffffffffffffff811115611ca157611ca06117d7565b5b611cad87828801611c1d565b9250506060611cbe87828801611846565b91505092959194509250565b5f5f60408385031215611ce057611cdf6117d3565b5b5f611ced858286016117f1565b9250506020611cfe85828601611846565b9150509250929050565b5f602082019050611d1b5f830184611a36565b92915050565b5f602082019050611d345f830184611778565b92915050565b5f608082019050611d4d5f830187611739565b8181036020830152611d5f81866118bd565b9050611d6e6040830185611739565b611d7b6060830184611a36565b95945050505050565b5f819050919050565b611d9681611d84565b8114611da0575f5ffd5b50565b5f81359050611db181611d8d565b92915050565b5f5f60408385031215611dcd57611dcc6117d3565b5b5f611dda85828601611da3565b9250506020611deb85828601611846565b9150509250929050565b5f7fff0000000000000000000000000000000000000000000000000000000000000082169050919050565b611e2981611df5565b82525050565b5f602082019050611e425f830184611e20565b92915050565b5f608082019050611e5b5f830187611739565b611e686020830186611739565b611e756040830185611739565b611e826060830184611739565b95945050505050565b5f5f5f60608486031215611ea257611ea16117d3565b5b5f611eaf86828701611846565b9350506020611ec086828701611846565b9250506040611ed186828701611846565b9150509250925092565b611ee481611a2b565b8114611eee575f5ffd5b50565b5f81359050611eff81611edb565b92915050565b5f5f5f60608486031215611f1c57611f1b6117d3565b5b5f611f29868287016117f1565b9350506020611f3a86828701611846565b9250506040611f4b86828701611ef1565b9150509250925092565b5f606082019050611f685f830186611739565b611f756020830185611739565b611f826040830184611778565b949350505050565b5f67ffffffffffffffff821115611fa457611fa3611b26565b5b611fad826118ad565b9050602081019050919050565b5f611fcc611fc784611f8a565b611b84565b905082815260208101848484011115611fe857611fe7611b22565b5b611ff3848285611bce565b509392505050565b5f82601f83011261200f5761200e611b1e565b5b813561201f848260208601611fba565b91505092915050565b5f6020828403121561203d5761203c6117d3565b5b5f82013567ffffffffffffffff81111561205a576120596117d7565b5b61206684828501611ffb565b91505092915050565b61207881611d84565b82525050565b5f6020820190506120915f83018461206f565b92915050565b7f4e6f74206f776e657200000000000000000000000000000000000000000000005f82015250565b5f6120cb60098361188f565b91506120d682612097565b602082019050919050565b5f6020820190508181035f8301526120f8816120bf565b9050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f61213682611730565b915061214183611730565b9250828201905080821115612159576121586120ff565b5b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f61219682611730565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036121c8576121c76120ff565b5b600182019050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f600282049050600182168061221757607f821691505b60208210810361222a576122296121d3565b5b50919050565b5f819050815f5260205f209050919050565b5f6020601f8301049050919050565b5f82821b905092915050565b5f6008830261228c7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82612251565b6122968683612251565b95508019841693508086168417925050509392505050565b5f819050919050565b5f6122d16122cc6122c784611730565b6122ae565b611730565b9050919050565b5f819050919050565b6122ea836122b7565b6122fe6122f6826122d8565b84845461225d565b825550505050565b5f5f905090565b612315612306565b6123208184846122e1565b505050565b5b81811015612343576123385f8261230d565b600181019050612326565b5050565b601f8211156123885761235981612230565b61236284612242565b81016020851015612371578190505b61238561237d85612242565b830182612325565b50505b505050565b5f82821c905092915050565b5f6123a85f198460080261238d565b1980831691505092915050565b5f6123c08383612399565b9150826002028217905092915050565b6123d982611885565b67ffffffffffffffff8111156123f2576123f1611b26565b5b6123fc8254612200565b612407828285612347565b5f60209050601f831160018114612438575f8415612426578287015190505b61243085826123b5565b865550612497565b601f19841661244686612230565b5f5b8281101561246d57848901518255600182019150602085019450602081019050612448565b8683101561248a5784890151612486601f891682612399565b8355505b6001600288020188555050505b505050505050565b5f6040820190506124b25f830185611739565b81810360208301526124c481846118bd565b90509392505050565b7f546f6f206c6172676500000000000000000000000000000000000000000000005f82015250565b5f61250160098361188f565b915061250c826124cd565b602082019050919050565b5f6020820190508181035f83015261252e816124f5565b9050919050565b5f61253f82611730565b915061254a83611730565b925082820261255881611730565b9150828204841483151761256f5761256e6120ff565b5b5092915050565b7f496e76616c69642072616e6765000000000000000000000000000000000000005f82015250565b5f6125aa600d8361188f565b91506125b582612576565b602082019050919050565b5f6020820190508181035f8301526125d78161259e565b9050919050565b7f496e646578206f7574206f6620626f756e6473000000000000000000000000005f82015250565b5f61261260138361188f565b915061261d826125de565b602082019050919050565b5f6020820190508181035f83015261263f81612606565b9050919050565b7f4d6f64756c7573206d757374206265203e2030000000000000000000000000005f82015250565b5f61267a60138361188f565b915061268582612646565b602082019050919050565b5f6020820190508181035f8301526126a78161266e565b9050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601260045260245ffd5b7f496e76616c6964206e6577206f776e65720000000000000000000000000000005f82015250565b5f61270f60118361188f565b915061271a826126db565b602082019050919050565b5f6020820190508181035f83015261273c81612703565b9050919050565b5f61274d82611730565b915061275883611730565b92508282039050818111156127705761276f6120ff565b5b9291505056fea2646970667358221220cfa8f9f50269ebd04f45e914670acb3424566d37b3535c92124bba2183e60a3864736f6c634300081e0033"

// Function selectors for ComplexContract
const (
	// View functions
	selectorComplexCounter          = "61bc221a" // counter()
	selectorComplexOwner            = "8da5cb5b" // owner()
	selectorComplexGetCount         = "a87d942c" // getCount()
	selectorComplexGetNumbersLength = "f3d4e562" // getNumbersLength()
	selectorComplexSumAllNumbers    = "56940712" // sumAllNumbers()
	selectorComplexGetContractBal   = "6f9fb98a" // getContractBalance()

	// Pure functions
	selectorComplexSumRange   = "a214547f" // sumRange(uint256,uint256)
	selectorComplexFactorial  = "83714834" // factorial(uint256)
	selectorComplexBitwiseOps = "b2745e42" // bitwiseOps(uint256,uint256)
	selectorComplexShiftOps   = "561597b3" // shiftOps(uint256,uint256)
	selectorComplexModArith   = "bdb75d62" // modArith(uint256,uint256,uint256)
	selectorComplexPower      = "c04f01fc" // power(uint256,uint256)
	selectorComplexMax        = "6d5433e6" // max(uint256,uint256)
	selectorComplexMin        = "7ae2b5c7" // min(uint256,uint256)
	selectorComplexMemoryTest = "5129f097" // memoryTest(uint256)
	selectorComplexCondTest   = "27e7e056" // conditionalTest(uint256)
	selectorComplexHashData   = "e66ef92d" // hashData(bytes)

	// State-changing functions
	selectorComplexIncrement = "5b34b966" // incrementCounter()
	selectorComplexAddNumber = "fce68023" // addNumber(uint256)
)

// setupComplexEVM creates a new EVM with storage for complex contract testing
func setupComplexEVM(t *testing.T) (*EVM, *StateDB, func()) {
	tmpDir := t.TempDir()
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	stateDB := NewStateDB(store)

	ctx := &Context{
		Origin:      core.Address{},
		GasPrice:    big.NewInt(1000000000),
		Coinbase:    core.Address{0xFE, 0xED},
		GasLimit:    30000000,
		BlockNumber: big.NewInt(12345),
		Time:        big.NewInt(1700000000),
		Difficulty:  big.NewInt(1),
		ChainID:     big.NewInt(1),
	}

	evm := NewEVM(ctx, stateDB)

	cleanup := func() {
		store.Close()
	}

	return evm, stateDB, cleanup
}

func TestE2E_ComplexContract_Deploy(t *testing.T) {
	t.Log("\n========== E2E TEST: COMPLEX CONTRACT DEPLOYMENT ==========")

	evm, stateDB, cleanup := setupComplexEVM(t)
	defer cleanup()

	// Define addresses
	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a}

	// Give deployer some ETH
	stateDB.SetBalance(deployer, big.NewInt(1000000000000000000))

	// Decode bytecode
	initCode, err := hex.DecodeString(complexContractBytecode)
	if err != nil {
		t.Fatalf("Failed to decode bytecode: %v", err)
	}

	// Encode constructor argument: initialCounter = 42
	constructorArg := make([]byte, 32)
	big.NewInt(42).FillBytes(constructorArg)

	// Append constructor args to init code
	initCode = append(initCode, constructorArg...)

	t.Logf("Init code size: %d bytes", len(initCode))

	// Calculate contract address
	nonce := stateDB.GetNonce(deployer)
	contractAddr := createAddress(deployer, nonce)
	stateDB.SetNonce(deployer, nonce+1)

	t.Logf("Contract will be deployed at: %x", contractAddr)

	// Deploy contract
	deployContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          initCode,
		Input:         []byte{},
		Value:         big.NewInt(0),
		Gas:           50000000,
	}

	result := evm.Execute(deployContract)
	if result.Err != nil {
		t.Fatalf("Failed to deploy contract: %v", result.Err)
	}

	if result.Reverted {
		t.Fatalf("Contract deployment reverted: %s", string(result.ReturnData))
	}

	t.Logf("Contract deployed! Runtime code size: %d bytes", len(result.ReturnData))

	// Store deployed code
	stateDB.SetCode(contractAddr, result.ReturnData)

	// ==== Test 1: Check counter() ====
	t.Log("\n--- Test 1: counter() ---")
	counterCalldata, _ := hex.DecodeString(selectorComplexCounter)
	counterContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          result.ReturnData,
		Input:         counterCalldata,
		Value:         big.NewInt(0),
		Gas:           1000000,
	}

	counterResult := evm.Execute(counterContract)
	if counterResult.Err != nil {
		t.Fatalf("Failed to call counter(): %v", counterResult.Err)
	}
	if counterResult.Reverted {
		t.Fatalf("counter() reverted")
	}

	counterValue := new(big.Int).SetBytes(counterResult.ReturnData)
	t.Logf("counter() = %s (expected: 42)", counterValue.String())
	if counterValue.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("counter() mismatch: expected 42, got %s", counterValue.String())
	}

	// ==== Test 2: Check owner() ====
	t.Log("\n--- Test 2: owner() ---")
	ownerCalldata, _ := hex.DecodeString(selectorComplexOwner)
	ownerContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          result.ReturnData,
		Input:         ownerCalldata,
		Value:         big.NewInt(0),
		Gas:           1000000,
	}

	ownerResult := evm.Execute(ownerContract)
	if ownerResult.Err != nil {
		t.Fatalf("Failed to call owner(): %v", ownerResult.Err)
	}
	if ownerResult.Reverted {
		t.Fatalf("owner() reverted")
	}

	// Extract address from result (last 20 bytes of 32-byte word)
	ownerAddr := ownerResult.ReturnData[12:32]
	expectedOwner := deployer[:]
	t.Logf("owner() = 0x%x", ownerAddr)
	t.Logf("expected = 0x%x", expectedOwner)

	match := true
	for i := 0; i < 20; i++ {
		if ownerAddr[i] != expectedOwner[i] {
			match = false
			break
		}
	}
	if !match {
		t.Errorf("owner() mismatch")
	}

	t.Log("\n========== DEPLOYMENT TESTS PASSED! ==========")
}

func TestE2E_ComplexContract_PureFunctions(t *testing.T) {
	t.Log("\n========== E2E TEST: PURE FUNCTIONS ==========")

	evm, stateDB, cleanup := setupComplexEVM(t)
	defer cleanup()

	// Define addresses
	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a}

	stateDB.SetBalance(deployer, big.NewInt(1000000000000000000))

	// Deploy contract first
	initCode, _ := hex.DecodeString(complexContractBytecode)
	constructorArg := make([]byte, 32)
	big.NewInt(100).FillBytes(constructorArg)
	initCode = append(initCode, constructorArg...)

	nonce := stateDB.GetNonce(deployer)
	contractAddr := createAddress(deployer, nonce)
	stateDB.SetNonce(deployer, nonce+1)

	deployContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          initCode,
		Input:         []byte{},
		Value:         big.NewInt(0),
		Gas:           50000000,
	}

	result := evm.Execute(deployContract)
	if result.Err != nil {
		t.Fatalf("Failed to deploy: %v", result.Err)
	}
	if result.Reverted {
		t.Fatalf("Deploy reverted")
	}

	stateDB.SetCode(contractAddr, result.ReturnData)
	runtimeCode := result.ReturnData

	// Helper function to call contract
	callContract := func(selector string, args ...[]byte) ([]byte, error) {
		calldata, _ := hex.DecodeString(selector)
		for _, arg := range args {
			calldata = append(calldata, arg...)
		}
		contract := &Contract{
			CallerAddress: deployer,
			Address:       contractAddr,
			Code:          runtimeCode,
			Input:         calldata,
			Value:         big.NewInt(0),
			Gas:           5000000,
		}
		res := evm.Execute(contract)
		if res.Err != nil {
			return nil, res.Err
		}
		if res.Reverted {
			return nil, nil // Reverted
		}
		return res.ReturnData, nil
	}

	// ==== Test sumRange(1, 10) ====
	t.Log("\n--- Test: sumRange(1, 10) ---")
	arg1 := make([]byte, 32)
	arg2 := make([]byte, 32)
	big.NewInt(1).FillBytes(arg1)
	big.NewInt(10).FillBytes(arg2)

	sumResult, err := callContract(selectorComplexSumRange, arg1, arg2)
	if err != nil {
		t.Fatalf("sumRange failed: %v", err)
	}
	sumValue := new(big.Int).SetBytes(sumResult)
	expected := big.NewInt(55) // 1+2+3+4+5+6+7+8+9+10 = 55
	t.Logf("sumRange(1, 10) = %s (expected: %s)", sumValue.String(), expected.String())
	if sumValue.Cmp(expected) != 0 {
		t.Errorf("sumRange mismatch: got %s, want %s", sumValue.String(), expected.String())
	}

	// ==== Test factorial(5) ====
	t.Log("\n--- Test: factorial(5) ---")
	arg1 = make([]byte, 32)
	big.NewInt(5).FillBytes(arg1)

	factResult, err := callContract(selectorComplexFactorial, arg1)
	if err != nil {
		t.Fatalf("factorial failed: %v", err)
	}
	factValue := new(big.Int).SetBytes(factResult)
	expected = big.NewInt(120) // 5! = 120
	t.Logf("factorial(5) = %s (expected: %s)", factValue.String(), expected.String())
	if factValue.Cmp(expected) != 0 {
		t.Errorf("factorial mismatch: got %s, want %s", factValue.String(), expected.String())
	}

	// ==== Test bitwiseOps(12, 10) ====
	t.Log("\n--- Test: bitwiseOps(12, 10) ---")
	arg1 = make([]byte, 32)
	arg2 = make([]byte, 32)
	big.NewInt(12).FillBytes(arg1) // 1100 in binary
	big.NewInt(10).FillBytes(arg2) // 1010 in binary

	bitwiseResult, err := callContract(selectorComplexBitwiseOps, arg1, arg2)
	if err != nil {
		t.Fatalf("bitwiseOps failed: %v", err)
	}
	// Result is 4 uint256: andResult, orResult, xorResult, notA
	andResult := new(big.Int).SetBytes(bitwiseResult[0:32])
	orResult := new(big.Int).SetBytes(bitwiseResult[32:64])
	xorResult := new(big.Int).SetBytes(bitwiseResult[64:96])

	t.Logf("12 & 10 = %s (expected: 8)", andResult.String())
	t.Logf("12 | 10 = %s (expected: 14)", orResult.String())
	t.Logf("12 ^ 10 = %s (expected: 6)", xorResult.String())

	if andResult.Cmp(big.NewInt(8)) != 0 {
		t.Errorf("AND mismatch: got %s, want 8", andResult.String())
	}
	if orResult.Cmp(big.NewInt(14)) != 0 {
		t.Errorf("OR mismatch: got %s, want 14", orResult.String())
	}
	if xorResult.Cmp(big.NewInt(6)) != 0 {
		t.Errorf("XOR mismatch: got %s, want 6", xorResult.String())
	}

	// ==== Test shiftOps(8, 2) ====
	t.Log("\n--- Test: shiftOps(8, 2) ---")
	arg1 = make([]byte, 32)
	arg2 = make([]byte, 32)
	big.NewInt(8).FillBytes(arg1)
	big.NewInt(2).FillBytes(arg2)

	shiftResult, err := callContract(selectorComplexShiftOps, arg1, arg2)
	if err != nil {
		t.Fatalf("shiftOps failed: %v", err)
	}
	leftShift := new(big.Int).SetBytes(shiftResult[0:32])
	rightShift := new(big.Int).SetBytes(shiftResult[32:64])

	t.Logf("8 << 2 = %s (expected: 32)", leftShift.String())
	t.Logf("8 >> 2 = %s (expected: 2)", rightShift.String())

	if leftShift.Cmp(big.NewInt(32)) != 0 {
		t.Errorf("Left shift mismatch: got %s, want 32", leftShift.String())
	}
	if rightShift.Cmp(big.NewInt(2)) != 0 {
		t.Errorf("Right shift mismatch: got %s, want 2", rightShift.String())
	}

	// ==== Test modArith(10, 7, 4) ====
	t.Log("\n--- Test: modArith(10, 7, 4) ---")
	arg1 = make([]byte, 32)
	arg2 = make([]byte, 32)
	arg3 := make([]byte, 32)
	big.NewInt(10).FillBytes(arg1)
	big.NewInt(7).FillBytes(arg2)
	big.NewInt(4).FillBytes(arg3)

	modResult, err := callContract(selectorComplexModArith, arg1, arg2, arg3)
	if err != nil {
		t.Fatalf("modArith failed: %v", err)
	}
	addMod := new(big.Int).SetBytes(modResult[0:32])
	mulMod := new(big.Int).SetBytes(modResult[32:64])

	// addmod(10, 7, 4) = (10 + 7) % 4 = 17 % 4 = 1
	// mulmod(10, 7, 4) = (10 * 7) % 4 = 70 % 4 = 2
	t.Logf("addmod(10, 7, 4) = %s (expected: 1)", addMod.String())
	t.Logf("mulmod(10, 7, 4) = %s (expected: 2)", mulMod.String())

	if addMod.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("addmod mismatch: got %s, want 1", addMod.String())
	}
	if mulMod.Cmp(big.NewInt(2)) != 0 {
		t.Errorf("mulmod mismatch: got %s, want 2", mulMod.String())
	}

	// ==== Test power(2, 10) ====
	t.Log("\n--- Test: power(2, 10) ---")
	arg1 = make([]byte, 32)
	arg2 = make([]byte, 32)
	big.NewInt(2).FillBytes(arg1)
	big.NewInt(10).FillBytes(arg2)

	powerResult, err := callContract(selectorComplexPower, arg1, arg2)
	if err != nil {
		t.Fatalf("power failed: %v", err)
	}
	powerValue := new(big.Int).SetBytes(powerResult)
	expected = big.NewInt(1024) // 2^10 = 1024
	t.Logf("power(2, 10) = %s (expected: %s)", powerValue.String(), expected.String())
	if powerValue.Cmp(expected) != 0 {
		t.Errorf("power mismatch: got %s, want %s", powerValue.String(), expected.String())
	}

	// ==== Test max(15, 25) ====
	t.Log("\n--- Test: max(15, 25) ---")
	arg1 = make([]byte, 32)
	arg2 = make([]byte, 32)
	big.NewInt(15).FillBytes(arg1)
	big.NewInt(25).FillBytes(arg2)

	maxResult, err := callContract(selectorComplexMax, arg1, arg2)
	if err != nil {
		t.Fatalf("max failed: %v", err)
	}
	maxValue := new(big.Int).SetBytes(maxResult)
	t.Logf("max(15, 25) = %s (expected: 25)", maxValue.String())
	if maxValue.Cmp(big.NewInt(25)) != 0 {
		t.Errorf("max mismatch: got %s, want 25", maxValue.String())
	}

	// ==== Test min(15, 25) ====
	t.Log("\n--- Test: min(15, 25) ---")
	minResult, err := callContract(selectorComplexMin, arg1, arg2)
	if err != nil {
		t.Fatalf("min failed: %v", err)
	}
	minValue := new(big.Int).SetBytes(minResult)
	t.Logf("min(15, 25) = %s (expected: 15)", minValue.String())
	if minValue.Cmp(big.NewInt(15)) != 0 {
		t.Errorf("min mismatch: got %s, want 15", minValue.String())
	}

	// ==== Test memoryTest(5) ====
	t.Log("\n--- Test: memoryTest(5) ---")
	arg1 = make([]byte, 32)
	big.NewInt(5).FillBytes(arg1)

	memResult, err := callContract(selectorComplexMemoryTest, arg1)
	if err != nil {
		t.Fatalf("memoryTest failed: %v", err)
	}
	memValue := new(big.Int).SetBytes(memResult)
	// sum of (5+0) + (5+1) + ... + (5+9) = 5*10 + (0+1+...+9) = 50 + 45 = 95
	expected = big.NewInt(95)
	t.Logf("memoryTest(5) = %s (expected: %s)", memValue.String(), expected.String())
	if memValue.Cmp(expected) != 0 {
		t.Errorf("memoryTest mismatch: got %s, want %s", memValue.String(), expected.String())
	}

	t.Log("\n========== PURE FUNCTION TESTS PASSED! ==========")
}

func TestE2E_ComplexContract_StateChanges(t *testing.T) {
	t.Log("\n========== E2E TEST: STATE CHANGES ==========")

	evm, stateDB, cleanup := setupComplexEVM(t)
	defer cleanup()

	// Define addresses
	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a}

	stateDB.SetBalance(deployer, big.NewInt(1000000000000000000))

	// Deploy contract with initial counter = 0
	initCode, _ := hex.DecodeString(complexContractBytecode)
	constructorArg := make([]byte, 32)
	big.NewInt(0).FillBytes(constructorArg)
	initCode = append(initCode, constructorArg...)

	nonce := stateDB.GetNonce(deployer)
	contractAddr := createAddress(deployer, nonce)
	stateDB.SetNonce(deployer, nonce+1)

	deployContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          initCode,
		Input:         []byte{},
		Value:         big.NewInt(0),
		Gas:           50000000,
	}

	result := evm.Execute(deployContract)
	if result.Err != nil {
		t.Fatalf("Failed to deploy: %v", result.Err)
	}
	if result.Reverted {
		t.Fatalf("Deploy reverted")
	}

	stateDB.SetCode(contractAddr, result.ReturnData)
	runtimeCode := result.ReturnData

	// Helper function
	callContract := func(selector string, args ...[]byte) ([]byte, error) {
		calldata, _ := hex.DecodeString(selector)
		for _, arg := range args {
			calldata = append(calldata, arg...)
		}
		contract := &Contract{
			CallerAddress: deployer,
			Address:       contractAddr,
			Code:          runtimeCode,
			Input:         calldata,
			Value:         big.NewInt(0),
			Gas:           5000000,
		}
		res := evm.Execute(contract)
		if res.Err != nil {
			return nil, res.Err
		}
		if res.Reverted {
			return nil, nil
		}
		return res.ReturnData, nil
	}

	// ==== Test incrementCounter() ====
	t.Log("\n--- Test: incrementCounter() ---")

	// Check initial counter
	counterResult, err := callContract(selectorComplexCounter)
	if err != nil {
		t.Fatalf("counter() failed: %v", err)
	}
	counterValue := new(big.Int).SetBytes(counterResult)
	t.Logf("Initial counter: %s", counterValue.String())

	// Increment counter 3 times
	for i := 1; i <= 3; i++ {
		_, err = callContract(selectorComplexIncrement)
		if err != nil {
			t.Fatalf("incrementCounter() failed: %v", err)
		}

		counterResult, err = callContract(selectorComplexCounter)
		if err != nil {
			t.Fatalf("counter() failed: %v", err)
		}
		counterValue = new(big.Int).SetBytes(counterResult)
		t.Logf("After increment %d: counter = %s", i, counterValue.String())

		if counterValue.Cmp(big.NewInt(int64(i))) != 0 {
			t.Errorf("counter mismatch after increment %d: got %s, want %d", i, counterValue.String(), i)
		}
	}

	// ==== Test addNumber() and sumAllNumbers() ====
	t.Log("\n--- Test: addNumber() and sumAllNumbers() ---")

	// Add numbers: 10, 20, 30
	numbers := []int64{10, 20, 30}
	for _, num := range numbers {
		arg := make([]byte, 32)
		big.NewInt(num).FillBytes(arg)
		_, err = callContract(selectorComplexAddNumber, arg)
		if err != nil {
			t.Fatalf("addNumber(%d) failed: %v", num, err)
		}
		t.Logf("Added number: %d", num)
	}

	// Check numbers length
	lengthResult, err := callContract(selectorComplexGetNumbersLength)
	if err != nil {
		t.Fatalf("getNumbersLength() failed: %v", err)
	}
	lengthValue := new(big.Int).SetBytes(lengthResult)
	t.Logf("Numbers length: %s (expected: 3)", lengthValue.String())
	if lengthValue.Cmp(big.NewInt(3)) != 0 {
		t.Errorf("length mismatch: got %s, want 3", lengthValue.String())
	}

	// Check sum
	sumResult, err := callContract(selectorComplexSumAllNumbers)
	if err != nil {
		t.Fatalf("sumAllNumbers() failed: %v", err)
	}
	sumValue := new(big.Int).SetBytes(sumResult)
	expected := big.NewInt(60) // 10 + 20 + 30
	t.Logf("Sum of numbers: %s (expected: %s)", sumValue.String(), expected.String())
	if sumValue.Cmp(expected) != 0 {
		t.Errorf("sum mismatch: got %s, want %s", sumValue.String(), expected.String())
	}

	t.Log("\n========== STATE CHANGE TESTS PASSED! ==========")
}

func TestE2E_ComplexContract_HashData(t *testing.T) {
	t.Log("\n========== E2E TEST: HASH DATA ==========")

	evm, stateDB, cleanup := setupComplexEVM(t)
	defer cleanup()

	// Define addresses
	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a}

	stateDB.SetBalance(deployer, big.NewInt(1000000000000000000))

	// Deploy contract
	initCode, _ := hex.DecodeString(complexContractBytecode)
	constructorArg := make([]byte, 32)
	big.NewInt(0).FillBytes(constructorArg)
	initCode = append(initCode, constructorArg...)

	nonce := stateDB.GetNonce(deployer)
	contractAddr := createAddress(deployer, nonce)
	stateDB.SetNonce(deployer, nonce+1)

	deployContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          initCode,
		Input:         []byte{},
		Value:         big.NewInt(0),
		Gas:           50000000,
	}

	result := evm.Execute(deployContract)
	if result.Err != nil {
		t.Fatalf("Failed to deploy: %v", result.Err)
	}
	if result.Reverted {
		t.Fatalf("Deploy reverted")
	}

	stateDB.SetCode(contractAddr, result.ReturnData)
	runtimeCode := result.ReturnData

	// Test hashData("hello")
	t.Log("\n--- Test: hashData(\"hello\") ---")

	// Encode calldata for hashData(bytes)
	// Function selector + offset (32) + length (5) + "hello" padded
	selector, _ := hex.DecodeString(selectorComplexHashData)
	offset := make([]byte, 32)
	big.NewInt(32).FillBytes(offset) // offset to dynamic data
	length := make([]byte, 32)
	big.NewInt(5).FillBytes(length) // length of "hello"
	data := []byte("hello")
	// Pad data to 32 bytes
	paddedData := make([]byte, 32)
	copy(paddedData, data)

	calldata := append(selector, offset...)
	calldata = append(calldata, length...)
	calldata = append(calldata, paddedData...)

	hashContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          runtimeCode,
		Input:         calldata,
		Value:         big.NewInt(0),
		Gas:           5000000,
	}

	hashResult := evm.Execute(hashContract)
	if hashResult.Err != nil {
		t.Fatalf("hashData failed: %v", hashResult.Err)
	}
	if hashResult.Reverted {
		t.Fatalf("hashData reverted")
	}

	t.Logf("keccak256(\"hello\") = 0x%x", hashResult.ReturnData)
	// Expected: keccak256("hello") = 0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8
	expectedHash, _ := hex.DecodeString("1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8")

	match := true
	if len(hashResult.ReturnData) != len(expectedHash) {
		match = false
	} else {
		for i := range hashResult.ReturnData {
			if hashResult.ReturnData[i] != expectedHash[i] {
				match = false
				break
			}
		}
	}
	if !match {
		t.Errorf("hash mismatch:\ngot:      0x%x\nexpected: 0x%x", hashResult.ReturnData, expectedHash)
	}

	t.Log("\n========== HASH DATA TEST PASSED! ==========")
}
